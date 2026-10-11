import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, IsNull } from 'typeorm';
import { RiskReview } from './entities/risk-review.entity';
import { RiskReviewStatus } from '../applications/application.enums';
import { RiskJobPayload } from './risk-job.payload';

@Injectable()
export class RiskReviewRecoveryService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RiskReviewRecoveryService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectQueue('risk-review')
    private readonly riskQueue: Queue<RiskJobPayload>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.recoverUnenqueuedReviews();
  }

  async recoverUnenqueuedReviews(): Promise<void> {
    const pendingReviews = await this.dataSource
      .getRepository(RiskReview)
      .find({
        where: {
          status: RiskReviewStatus.PENDING,
          enqueuedAt: IsNull(),
        },
      });

    if (pendingReviews.length === 0) return;

    this.logger.log(
      `Found ${pendingReviews.length} un-enqueued risk reviews. Enqueueing now...`,
    );

    const attempts = parseInt(process.env.RISK_RETRY_ATTEMPTS ?? '5', 10);
    const backoffDelay = parseInt(process.env.RISK_BACKOFF_DELAY ?? '2000', 10);

    for (const review of pendingReviews) {
      const jobId = `risk-review-${review.applicationId}-${review.submissionNumber}`;
      const payload: RiskJobPayload = {
        applicationId: review.applicationId,
        submissionNumber: review.submissionNumber,
        riskReviewId: review.id,
      };

      try {
        await this.riskQueue.add('assess', payload, {
          jobId,
          attempts,
          backoff: { type: 'exponential', delay: backoffDelay },
          removeOnComplete: { age: 86400, count: 1000 },
          removeOnFail: false,
        });

        await this.dataSource
          .getRepository(RiskReview)
          .update({ id: review.id }, { enqueuedAt: new Date() });
      } catch (err: unknown) {
        this.logger.error(
          `Failed to recover review ${review.id} for app ${review.applicationId}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
  }
}
