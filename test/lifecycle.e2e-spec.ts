import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Server } from 'node:http';
import { createTestApp, resetDb } from './helpers/test-app.helper';
import { createUserAndToken } from './helpers/auth.helper';
import { createApplication } from './helpers/application.helper';
import { Role } from '../src/users/role.enum';
import { MerchantApplication } from '../src/applications/entities/merchant-application.entity';
import {
  ApplicationStatus,
  RiskLevel,
} from '../src/applications/application.enums';
import { RiskReview } from '../src/risk/entities/risk-review.entity';

describe('Lifecycle & Transitions (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;

  let salesToken: string;
  let reviewerToken: string;
  let adminToken: string;

  let reviewerId: string;
  let salesId: string;
  let adminId: string;

  beforeAll(async () => {
    const testCtx = await createTestApp();
    app = testCtx.app;
    dataSource = testCtx.dataSource;
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(dataSource);

    const s = await createUserAndToken(app, Role.SALES, {
      email: 'sales@example.com',
    });
    salesToken = s.token;
    salesId = s.user.id;

    const r = await createUserAndToken(app, Role.REVIEWER, {
      email: 'reviewer@example.com',
    });
    reviewerToken = r.token;
    reviewerId = r.user.id;

    const adm = await createUserAndToken(app, Role.ADMIN, {
      email: 'admin@example.com',
    });
    adminToken = adm.token;
    adminId = adm.user.id;
  });

  it('Happy path: create (DRAFT) -> submit (202) -> manual set IN_REVIEW -> assign -> approve -> APPROVED', async () => {
    // 1. Create DRAFT
    const createRes = await createApplication(app, salesToken);
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe(ApplicationStatus.DRAFT);
    const appId = createRes.body.id;

    // 2. Submit -> 202
    const submitRes = await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(submitRes.status).toBe(202);

    // 3. Move to IN_REVIEW in DB (simulating risk review completion)
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id: appId }, { status: ApplicationStatus.IN_REVIEW });

    // 4. Admin assigns reviewer -> 200
    const assignRes = await request(server)
      .post(`/applications/${appId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerId });
    expect(assignRes.status).toBe(200);

    // 5. Reviewer approves -> 201
    const decideRes = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'APPROVE' });
    expect(decideRes.status).toBe(201);

    // 6. Application is APPROVED with decidedAt set
    const detailRes = await request(server)
      .get(`/applications/${appId}`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(detailRes.body.status).toBe(ApplicationStatus.APPROVED);
  });

  it('REQUEST_INFO flow: decision REQUEST_INFO -> NEEDS_INFO -> owner PATCHes -> resubmit -> submission_count=2 and 2nd risk review row', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    // Submit submission 1
    await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);

    // Set IN_REVIEW and assign reviewer
    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: reviewerId,
      },
    );

    // Reviewer requests info with comment
    const reqInfoRes = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'REQUEST_INFO',
        comment: 'Please upload updated business certificates.',
      });
    expect(reqInfoRes.status).toBe(201);

    const appAfterReq = await dataSource
      .getRepository(MerchantApplication)
      .findOneBy({ id: appId });
    expect(appAfterReq?.status).toBe(ApplicationStatus.NEEDS_INFO);

    // Owner PATCHes application
    const patchRes = await request(server)
      .patch(`/applications/${appId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ businessName: 'Everest Coffee Updated' });
    expect(patchRes.status).toBe(200);

    // Owner resubmits -> submission_count becomes 2, status SUBMITTED
    const resubmitRes = await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(resubmitRes.status).toBe(202);

    const appAfterResubmit = await dataSource
      .getRepository(MerchantApplication)
      .findOneBy({ id: appId });
    expect(appAfterResubmit?.status).toBe(ApplicationStatus.SUBMITTED);
    expect(appAfterResubmit?.submissionCount).toBe(2);
    // assigned reviewer should be preserved
    expect(appAfterResubmit?.assignedReviewerId).toBe(reviewerId);

    const riskReviews = await dataSource
      .getRepository(RiskReview)
      .findBy({ applicationId: appId });
    expect(riskReviews).toHaveLength(2);
  });

  it('Invalid transitions return 409 with machine-readable error code', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    // 1. Submit application to SUBMITTED
    await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);

    // 2. Submit twice -> 409 INVALID_STATE_TRANSITION
    const doubleSubmitRes = await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesToken}`);
    expect(doubleSubmitRes.status).toBe(409);
    expect(doubleSubmitRes.body.code).toBe('INVALID_STATE_TRANSITION');

    // 3. PATCH after submit -> 409 APPLICATION_NOT_EDITABLE
    const patchRes = await request(server)
      .patch(`/applications/${appId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ businessName: 'Changed' });
    expect(patchRes.status).toBe(409);
    expect(patchRes.body.code).toBe('APPLICATION_NOT_EDITABLE');

    // 4. Decision in SUBMITTED -> 409 INVALID_STATE_TRANSITION (when reviewer is assigned)
    const createSubmitted = await createApplication(app, salesToken);
    const subId = createSubmitted.body.id;
    // Set to SUBMITTED without worker processing
    await dataSource.getRepository(MerchantApplication).update(
      { id: subId },
      {
        status: ApplicationStatus.SUBMITTED,
        assignedReviewerId: reviewerId,
      },
    );
    const decisionSubmittedRes = await request(server)
      .post(`/applications/${subId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'APPROVE' });
    expect(decisionSubmittedRes.status).toBe(409);
    expect(decisionSubmittedRes.body.code).toBe('INVALID_STATE_TRANSITION');

    // 5. Decision after APPROVED -> 409
    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.APPROVED,
        assignedReviewerId: reviewerId,
      },
    );
    const decisionAfterApprovedRes = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'APPROVE' });
    expect(decisionAfterApprovedRes.status).toBe(409);
    expect(decisionAfterApprovedRes.body.code).toBe('INVALID_STATE_TRANSITION');

    // 6. Assign in DRAFT -> 409
    const createDraftRes = await createApplication(app, salesToken);
    const draftId = createDraftRes.body.id;
    const assignDraftRes = await request(server)
      .post(`/applications/${draftId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerId });
    expect(assignDraftRes.status).toBe(409);
    expect(assignDraftRes.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('Assign reviewer eligibility: unknown, inactive, sales, or admin -> 400 REVIEWER_NOT_ELIGIBLE', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id: appId }, { status: ApplicationStatus.SUBMITTED });

    // Sales as reviewer
    const resSales = await request(server)
      .post(`/applications/${appId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerId: salesId });
    expect(resSales.status).toBe(400);
    expect(resSales.body.code).toBe('REVIEWER_NOT_ELIGIBLE');

    // Admin as reviewer
    const resAdmin = await request(server)
      .post(`/applications/${appId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerId: adminId });
    expect(resAdmin.status).toBe(400);
    expect(resAdmin.body.code).toBe('REVIEWER_NOT_ELIGIBLE');

    // Non-existent user
    const resUnknown = await request(server)
      .post(`/applications/${appId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerId: '00000000-0000-0000-0000-000000000000' });
    expect(resUnknown.status).toBe(400);
    expect(resUnknown.body.code).toBe('REVIEWER_NOT_ELIGIBLE');
  });

  it('Decision comment rules: REJECT & REQUEST_INFO require comment; APPROVE with HIGH risk requires comment', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;
    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: reviewerId,
        submissionCount: 1,
      },
    );

    // 1. REJECT without comment -> 400 COMMENT_REQUIRED
    const rejectNoComment = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'REJECT' });
    expect(rejectNoComment.status).toBe(400);
    expect(rejectNoComment.body.code).toBe('COMMENT_REQUIRED');

    // 2. REQUEST_INFO without comment -> 400 COMMENT_REQUIRED
    const reqInfoNoComment = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'REQUEST_INFO' });
    expect(reqInfoNoComment.status).toBe(400);
    expect(reqInfoNoComment.body.code).toBe('COMMENT_REQUIRED');

    // 3. APPROVE with HIGH risk level review without comment -> 400 COMMENT_REQUIRED
    await dataSource.getRepository(RiskReview).save({
      applicationId: appId,
      submissionNumber: 1,
      riskLevel: RiskLevel.HIGH,
      riskScore: 75,
      flags: ['HIGH_RISK_MCC'],
    });

    const approveHighNoComment = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'APPROVE' });
    expect(approveHighNoComment.status).toBe(400);
    expect(approveHighNoComment.body.code).toBe('COMMENT_REQUIRED');

    // APPROVE with comment on HIGH risk -> 201
    const approveHighWithComment = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'APPROVE',
        comment:
          'Override approved by senior risk management after KYC verification.',
      });
    expect(approveHighWithComment.status).toBe(201);
  });

  it('Pagination, sorting, and filters work correctly', async () => {
    // Create 3 applications
    await createApplication(app, salesToken, { businessName: 'App 1' });
    await createApplication(app, salesToken, { businessName: 'App 2' });
    await createApplication(app, salesToken, { businessName: 'App 3' });

    const listRes = await request(server)
      .get('/applications?page=1&limit=2')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(2);
    expect(listRes.body.meta.total).toBe(3);
    expect(listRes.body.meta.totalPages).toBe(2);

    // limit > 100 -> 400
    const overLimitRes = await request(server)
      .get('/applications?limit=101')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(overLimitRes.status).toBe(400);

    // Invalid status filter -> 400
    const invalidStatusRes = await request(server)
      .get('/applications?status=NOT_A_STATUS')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(invalidStatusRes.status).toBe(400);

    // Invalid sort column -> 400
    const invalidSortRes = await request(server)
      .get('/applications?sort=secretColumn')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(invalidSortRes.status).toBe(400);
  });
});
