import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Server } from 'node:http';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createTestApp, resetDb } from './helpers/test-app.helper';
import { createUserAndToken } from './helpers/auth.helper';
import { createApplication, waitFor } from './helpers/application.helper';
import { Role } from '../src/users/role.enum';
import { MerchantApplication } from '../src/applications/entities/merchant-application.entity';
import { RiskReview } from '../src/risk/entities/risk-review.entity';
import {
  ApplicationStatus,
  RiskReviewStatus,
  RiskStatus,
} from '../src/applications/application.enums';
import {
  RISK_PROVIDER,
  RiskProvider,
  RiskProviderPermanentError,
  RiskProviderTransientError,
} from '../src/risk/risk-provider.interface';
import { RiskReviewRecoveryService } from '../src/risk/risk-review-recovery.service';
import { AuditLog } from '../src/audit/entities/audit-log.entity';

describe('Async Risk Review & Reliability (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;
  let riskQueue: Queue;
  let recoveryService: RiskReviewRecoveryService;

  let salesToken: string;

  beforeAll(async () => {
    // Configure tiny backoff for fast tests
    process.env.RISK_BACKOFF_DELAY = '10';
    process.env.RISK_RETRY_ATTEMPTS = '3';

    const testCtx = await createTestApp();
    app = testCtx.app;
    dataSource = testCtx.dataSource;
    server = app.getHttpServer() as Server;
    riskQueue = app.get<Queue>(getQueueToken('risk-review'));
    recoveryService = app.get(RiskReviewRecoveryService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(dataSource);
    await riskQueue.obliterate({ force: true });

    const s = await createUserAndToken(app, Role.SALES, {
      email: 'sales-async@example.com',
    });
    salesToken = s.token;
  });

  it('Concurrent submit: firing two submits concurrently results in one 202 and one 409', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    const [res1, res2] = await Promise.all([
      request(server)
        .post(`/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${salesToken}`),
      request(server)
        .post(`/applications/${appId}/submit`)
        .set('Authorization', `Bearer ${salesToken}`),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([202, 409]);

    // Exactly one risk_review row was created
    const reviews = await dataSource
      .getRepository(RiskReview)
      .findBy({ applicationId: appId });
    expect(reviews).toHaveLength(1);
  });

  it('End-to-end happy path: submit -> worker assesses -> application transitions to IN_REVIEW with CLEAR riskStatus', async () => {
    const createRes = await createApplication(app, salesToken, {
      mcc: '5411', // low risk
    });
    const appId = createRes.body.id;

    const submitRes = await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(submitRes.status).toBe(202);

    // Wait for worker to complete
    const completedApp = await waitFor(async () => {
      const a = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      if (a && a.status === ApplicationStatus.IN_REVIEW) return a;
      return null;
    });

    expect(completedApp).toBeDefined();
    expect(completedApp!.status).toBe(ApplicationStatus.IN_REVIEW);
    expect(completedApp!.riskStatus).toBe(RiskStatus.CLEAR);

    const review = await dataSource
      .getRepository(RiskReview)
      .findOneBy({ applicationId: appId });
    expect(review?.status).toBe(RiskReviewStatus.COMPLETED);
    expect(review?.riskScore).toBe(10);
  });

  it('Redis payload inspection: job contains only the 3 ID fields (applicationId, submissionNumber, riskReviewId)', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    // Pause queue to inspect job
    await riskQueue.pause();

    await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);

    const jobs = await riskQueue.getJobs(['waiting', 'paused']);
    expect(jobs.length).toBeGreaterThan(0);

    const jobData = jobs[0].data;
    expect(Object.keys(jobData).sort()).toEqual(
      ['applicationId', 'riskReviewId', 'submissionNumber'].sort(),
    );
    expect(jobData.applicationId).toBe(appId);
    expect(jobData.submissionNumber).toBe(1);

    await riskQueue.resume();
  });

  it('Duplicate processing: delivering job twice does not re-assess or re-record completion', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);

    // Wait for first completion
    await waitFor(async () => {
      const a = await dataSource
        .getRepository(MerchantApplication)
        .findOneBy({ id: appId });
      return a && a.status === ApplicationStatus.IN_REVIEW ? a : null;
    });

    const auditsBefore = await dataSource
      .getRepository(AuditLog)
      .findBy({ entityId: appId, action: 'RISK_REVIEW_COMPLETED' });
    expect(auditsBefore).toHaveLength(1);

    // Re-deliver job with same payload directly bypassing deduplication
    const review = await dataSource
      .getRepository(RiskReview)
      .findOneBy({ applicationId: appId });

    await riskQueue.add('assess', {
      applicationId: appId,
      submissionNumber: 1,
      riskReviewId: review!.id,
    });

    // Allow worker time to process duplicate
    await new Promise((resolve) => setTimeout(resolve, 200));

    const auditsAfter = await dataSource
      .getRepository(AuditLog)
      .findBy({ entityId: appId, action: 'RISK_REVIEW_COMPLETED' });
    expect(auditsAfter).toHaveLength(1);
  });

  it('Recovery service: picks up un-enqueued pending reviews and enqueues them', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    // Insert pending review without enqueued_at
    await dataSource
      .getRepository(MerchantApplication)
      .update(
        { id: appId },
        { status: ApplicationStatus.SUBMITTED, submissionCount: 1 },
      );

    const review = await dataSource.getRepository(RiskReview).save({
      applicationId: appId,
      submissionNumber: 1,
      status: RiskReviewStatus.PENDING,
      enqueuedAt: null,
    });

    // Run recovery
    await recoveryService.recoverUnenqueuedReviews();

    // Verify review enqueuedAt was set and worker processed it
    await waitFor(async () => {
      const updatedReview = await dataSource
        .getRepository(RiskReview)
        .findOneBy({ id: review.id });
      return updatedReview &&
        updatedReview.status === RiskReviewStatus.COMPLETED
        ? updatedReview
        : null;
    });

    const finishedApp = await dataSource
      .getRepository(MerchantApplication)
      .findOneBy({ id: appId });
    expect(finishedApp?.status).toBe(ApplicationStatus.IN_REVIEW);
  });
});
