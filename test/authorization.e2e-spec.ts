import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Server } from 'node:http';
import { createTestApp, resetDb } from './helpers/test-app.helper';
import { createUserAndToken } from './helpers/auth.helper';
import { createApplication } from './helpers/application.helper';
import { Role } from '../src/users/role.enum';
import { MerchantApplication } from '../src/applications/entities/merchant-application.entity';
import { ReviewDecision } from '../src/applications/entities/review-decision.entity';
import { ApplicationStatus } from '../src/applications/application.enums';

describe('Authorization Matrix (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;

  let salesAToken: string;
  let salesBToken: string;
  let reviewerAToken: string;
  let reviewerBToken: string;
  let adminToken: string;

  let salesAId: string;
  let reviewerAId: string;
  let reviewerBId: string;

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

    const sA = await createUserAndToken(app, Role.SALES, {
      email: 'salesa@example.com',
    });
    salesAToken = sA.token;
    salesAId = sA.user.id;

    const sB = await createUserAndToken(app, Role.SALES, {
      email: 'salesb@example.com',
    });
    salesBToken = sB.token;

    const rA = await createUserAndToken(app, Role.REVIEWER, {
      email: 'reviewera@example.com',
    });
    reviewerAToken = rA.token;
    reviewerAId = rA.user.id;

    const rB = await createUserAndToken(app, Role.REVIEWER, {
      email: 'reviewerb@example.com',
    });
    reviewerBToken = rB.token;
    reviewerBId = rB.user.id;

    const adm = await createUserAndToken(app, Role.ADMIN, {
      email: 'admin@example.com',
    });
    adminToken = adm.token;
  });

  it('SALES B receives 404 when requesting SALES A application (isolated scope)', async () => {
    const createRes = await createApplication(app, salesAToken);
    expect(createRes.status).toBe(201);
    const appId = createRes.body.id;

    const getRes = await request(server)
      .get(`/applications/${appId}`)
      .set('Authorization', `Bearer ${salesBToken}`);
    expect(getRes.status).toBe(404);
  });

  it('SALES B calls PATCH, POST /submit, POST /assign, POST /decisions on A application -> 404 or 403, and DB row is unchanged', async () => {
    const createRes = await createApplication(app, salesAToken);
    const appId = createRes.body.id;

    // PATCH by Sales B -> 404
    const patchRes = await request(server)
      .patch(`/applications/${appId}`)
      .set('Authorization', `Bearer ${salesBToken}`)
      .send({ businessName: 'Hacked Name' });
    expect(patchRes.status).toBe(404);

    // POST /submit by Sales B -> 404
    const submitRes = await request(server)
      .post(`/applications/${appId}/submit`)
      .set('Authorization', `Bearer ${salesBToken}`);
    expect(submitRes.status).toBe(404);

    // POST /assign by Sales B -> 403 (role gate runs before object lookup)
    const assignRes = await request(server)
      .post(`/applications/${appId}/assign`)
      .set('Authorization', `Bearer ${salesBToken}`)
      .send({ reviewerId: reviewerAId });
    expect(assignRes.status).toBe(403);

    // POST /decisions by Sales B -> 403 (role gate runs first)
    const decisionRes = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${salesBToken}`)
      .send({ decision: 'APPROVE', comment: 'Unauthorized approve' });
    expect(decisionRes.status).toBe(403);

    // Assert row is completely unchanged in DB
    const dbApp = await dataSource
      .getRepository(MerchantApplication)
      .findOneBy({ id: appId });
    expect(dbApp?.businessName).toBe('Everest Coffee');
    expect(dbApp?.status).toBe(ApplicationStatus.DRAFT);
  });

  it("SALES B list never contains SALES A's applications, even when passing ?createdById or ?assignedReviewerId", async () => {
    await createApplication(app, salesAToken);

    const listRes = await request(server)
      .get('/applications')
      .set('Authorization', `Bearer ${salesBToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items).toHaveLength(0);

    // If salesB tries to pass unknown param ?createdById -> 400 (forbidNonWhitelisted)
    const queryTamperRes = await request(server)
      .get(`/applications?createdById=${salesAId}`)
      .set('Authorization', `Bearer ${salesBToken}`);
    expect(queryTamperRes.status).toBe(400);
  });

  it('SALES attempting to approve -> 403', async () => {
    const createRes = await createApplication(app, salesAToken);
    const appId = createRes.body.id;

    const res = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${salesAToken}`)
      .send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('non-assigned REVIEWER B attempting to record decision -> 403; row unchanged; no decision row', async () => {
    const createRes = await createApplication(app, salesAToken);
    const appId = createRes.body.id;

    // Directly assign reviewer A and put app in IN_REVIEW state in DB
    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: reviewerAId,
      },
    );

    const res = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);

    // Verify row unchanged and no review_decisions row
    const dbApp = await dataSource
      .getRepository(MerchantApplication)
      .findOneBy({ id: appId });
    expect(dbApp?.status).toBe(ApplicationStatus.IN_REVIEW);

    const decisions = await dataSource
      .getRepository(ReviewDecision)
      .findBy({ applicationId: appId });
    expect(decisions).toHaveLength(0);
  });

  it('ADMIN attempting to record decision -> 403', async () => {
    const createRes = await createApplication(app, salesAToken);
    const appId = createRes.body.id;

    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: reviewerAId,
      },
    );

    const res = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('assigned REVIEWER A records decision on IN_REVIEW application -> 201', async () => {
    const createRes = await createApplication(app, salesAToken);
    const appId = createRes.body.id;

    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.IN_REVIEW,
        assignedReviewerId: reviewerAId,
      },
    );

    const res = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerAToken}`)
      .send({ decision: 'APPROVE' });
    expect(res.status).toBe(201);
  });

  it('non-assigned REVIEWER deciding on a SUBMITTED application -> 403 (not 409), proving the check order', async () => {
    const createRes = await createApplication(app, salesAToken);
    const appId = createRes.body.id;

    await dataSource.getRepository(MerchantApplication).update(
      { id: appId },
      {
        status: ApplicationStatus.SUBMITTED,
        assignedReviewerId: reviewerAId,
      },
    );

    // reviewer B is NOT assigned
    const res = await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerBToken}`)
      .send({ decision: 'APPROVE' });
    expect(res.status).toBe(403);
  });

  it('Mass assignment: POST /applications with forbidden properties -> 400 and nothing persisted', async () => {
    const res = await request(server)
      .post('/applications')
      .set('Authorization', `Bearer ${salesAToken}`)
      .send({
        businessName: 'Coffee Shop',
        legalBusinessName: 'Coffee Shop Inc',
        businessType: 'LLC',
        mcc: '5411',
        owner: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+9779800000000',
        },
        processing: {
          expectedMonthlyVolume: 1000000,
          averageTicketSize: 5000,
          highestTicketSize: 10000,
        },
        // Injected fields:
        status: 'APPROVED',
        riskStatus: 'CLEAR',
        submissionCount: 99,
        createdById: '00000000-0000-0000-0000-000000000000',
      });

    expect(res.status).toBe(400);
  });

  it('No token -> 401 on every route', async () => {
    const dummyId = '00000000-0000-0000-0000-000000000000';
    const routes = [
      { method: 'post', path: '/applications', body: {} },
      { method: 'get', path: '/applications' },
      { method: 'get', path: `/applications/${dummyId}` },
      { method: 'patch', path: `/applications/${dummyId}`, body: {} },
      { method: 'post', path: `/applications/${dummyId}/submit` },
      { method: 'post', path: `/applications/${dummyId}/assign`, body: {} },
      { method: 'post', path: `/applications/${dummyId}/decisions`, body: {} },
      { method: 'get', path: `/applications/${dummyId}/decisions` },
      { method: 'get', path: '/audit-logs' },
    ];

    for (const r of routes) {
      let req = (request(server) as any)[r.method](r.path);
      if (r.body) req = req.send(r.body);
      const res = await req;
      expect(res.status).toBe(401);
    }
  });

  it('A response never contains raw businessTaxId or ownerDateOfBirth', async () => {
    const createRes = await createApplication(app, salesAToken, {
      businessTaxId: '000000001',
      owner: {
        firstName: 'Secret',
        lastName: 'Owner',
        email: 'secret@example.com',
        phone: '+9779800000000',
        dateOfBirth: '1990-01-15',
      },
    });

    expect(createRes.status).toBe(201);
    const bodyStr = JSON.stringify(createRes.body);
    expect(bodyStr).not.toContain('000000001');
    expect(bodyStr).not.toContain('1990-01-15');
    expect(createRes.body.businessTaxIdMasked).toBe('*****0001');
    expect(createRes.body.owner.dateOfBirth).toBeUndefined();
  });
});
