import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { DataSource } from 'typeorm';
import { RiskJobPayload } from './risk-job.payload';
import {
  RISK_PROVIDER,
  RiskProvider,
  RiskProviderPermanentError,
} from './risk-provider.interface';
import { RiskReview } from './entities/risk-review.entity';
import { MerchantApplication } from '../applications/entities/merchant-application.entity';
import {
  ApplicationStatus,
  RiskReviewStatus,
  RiskStatus,
} from '../applications/application.enums';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.actions';
import { RiskAssessmentInput } from './scoring/risk-scorer';

@Processor('risk-review', {
  concurrency: parseInt(process.env.RISK_WORKER_CONCURRENCY ?? '5', 10),
})
export class RiskReviewProcessor extends WorkerHost {
  private readonly logger = new Logger(RiskReviewProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(RISK_PROVIDER)
    private readonly riskProvider: RiskProvider,
    private readonly auditService: AuditService,
  ) {
    super();
  }

  async process(job: Job<RiskJobPayload>): Promise<void> {
    const { applicationId, submissionNumber, riskReviewId } = job.data;

    // 1. Load the risk_reviews row by riskReviewId
    const review = await this.dataSource.getRepository(RiskReview).findOne({
      where: { id: riskReviewId },
    });
    if (!review) {
      this.logger.error(
        `Risk review not found for id ${riskReviewId}; throwing UnrecoverableError`,
      );
      throw new UnrecoverableError(
        `RiskReview not found for ID: ${riskReviewId}`,
      );
    }

    // 2. If status = COMPLETED -> return (Idempotency Step 1)
    if (review.status === RiskReviewStatus.COMPLETED) {
      this.logger.log(
        `Risk review ${riskReviewId} already COMPLETED. Skipping job.`,
      );
      return;
    }

    // 3. Load application (plain read)
    const app = await this.dataSource
      .getRepository(MerchantApplication)
      .findOne({
        where: { id: applicationId },
      });

    if (
      !app ||
      app.submissionCount !== submissionNumber ||
      app.status !== ApplicationStatus.SUBMITTED
    ) {
      this.logger.warn(
        `Stale job or invalid application state for app ${applicationId}, submission ${submissionNumber}. Skipping.`,
      );
      return;
    }

    // 4. UPDATE risk_reviews SET status='PROCESSING', attempts = attempts + 1
    await this.dataSource
      .createQueryBuilder()
      .update(RiskReview)
      .set({
        status: RiskReviewStatus.PROCESSING,
        attempts: () => 'attempts + 1',
        startedAt: () => 'COALESCE(started_at, now())',
      })
      .where('id = :id AND status IN (:...statuses)', {
        id: riskReviewId,
        statuses: [RiskReviewStatus.PENDING, RiskReviewStatus.PROCESSING],
      })
      .execute();

    // 5. Call provider.assess() WITHOUT holding any database transaction
    const assessmentInput: RiskAssessmentInput = {
      mcc: app.mcc,
      businessType: app.businessType,
      hasWebsite: Boolean(app.website),
      expectedMonthlyVolume: app.expectedMonthlyVolume,
      averageTicketSize: app.averageTicketSize,
      highestTicketSize: app.highestTicketSize,
      currency: app.currency,
    };

    let assessment;
    try {
      assessment = await this.riskProvider.assess(assessmentInput);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : 'Unknown provider error';

      await this.dataSource
        .getRepository(RiskReview)
        .update({ id: riskReviewId }, { lastError: errorMessage });

      if (err instanceof RiskProviderPermanentError) {
        throw new UnrecoverableError(errorMessage);
      }
      throw err;
    }

    // 6. Persist result in one transaction
    await this.dataSource.transaction(async (manager) => {
      // Lock review
      const lockedReview = await manager
        .createQueryBuilder(RiskReview, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: riskReviewId })
        .getOne();

      if (!lockedReview || lockedReview.status === RiskReviewStatus.COMPLETED) {
        return;
      }

      // Lock app
      const lockedApp = await manager
        .createQueryBuilder(MerchantApplication, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: applicationId })
        .getOne();

      if (
        !lockedApp ||
        lockedApp.submissionCount !== submissionNumber ||
        lockedApp.status !== ApplicationStatus.SUBMITTED
      ) {
        return;
      }

      const beforeAppState = { ...lockedApp };

      // Update review
      lockedReview.status = RiskReviewStatus.COMPLETED;
      lockedReview.riskLevel = assessment.level;
      lockedReview.riskScore = assessment.score;
      lockedReview.flags = assessment.flags;
      lockedReview.providerReference =
        'sim-' + Math.random().toString(36).substring(2, 10);
      lockedReview.completedAt = new Date();
      await manager.save(RiskReview, lockedReview);

      // Update app
      lockedApp.status = ApplicationStatus.IN_REVIEW;
      lockedApp.riskStatus = assessment.riskStatus;
      await manager.save(MerchantApplication, lockedApp);

      // Insert audit
      await this.auditService.record(manager, {
        actor: { type: 'SYSTEM' },
        action: AUDIT_ACTIONS.RISK_REVIEW_COMPLETED,
        entityType: 'merchant_application',
        entityId: lockedApp.id,
        before: beforeAppState,
        after: lockedApp as unknown as Record<string, unknown>,
        metadata: {
          submissionNumber,
          riskLevel: assessment.level,
          riskScore: assessment.score,
        },
      });
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<RiskJobPayload>, err: Error): Promise<void> {
    const isUnrecoverable = err instanceof UnrecoverableError;
    const maxAttempts = job.opts?.attempts ?? 1;
    const isExhausted = job.attemptsMade >= maxAttempts;

    if (!isUnrecoverable && !isExhausted) {
      return;
    }

    const { applicationId, riskReviewId, submissionNumber } = job.data;
    this.logger.warn(
      `Job ${job.id} for app ${applicationId} failed permanently. Marking FAILED.`,
    );

    await this.dataSource.transaction(async (manager) => {
      const review = await manager
        .createQueryBuilder(RiskReview, 'r')
        .setLock('pessimistic_write')
        .where('r.id = :id', { id: riskReviewId })
        .getOne();

      if (
        !review ||
        review.status === RiskReviewStatus.COMPLETED ||
        review.status === RiskReviewStatus.FAILED
      ) {
        return;
      }

      const app = await manager
        .createQueryBuilder(MerchantApplication, 'a')
        .setLock('pessimistic_write')
        .where('a.id = :id', { id: applicationId })
        .getOne();

      if (!app) return;

      const beforeAppState = { ...app };

      review.status = RiskReviewStatus.FAILED;
      review.lastError = err.message;
      await manager.save(RiskReview, review);

      app.riskStatus = RiskStatus.FAILED;
      // status stays SUBMITTED
      await manager.save(MerchantApplication, app);

      await this.auditService.record(manager, {
        actor: { type: 'SYSTEM' },
        action: AUDIT_ACTIONS.RISK_REVIEW_FAILED,
        entityType: 'merchant_application',
        entityId: app.id,
        before: beforeAppState,
        after: app as unknown as Record<string, unknown>,
        metadata: {
          submissionNumber,
          error: err.message,
        },
      });
    });
  }
}
