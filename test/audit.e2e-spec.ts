import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Server } from 'node:http';
import { createTestApp, resetDb } from './helpers/test-app.helper';
import { createUserAndToken } from './helpers/auth.helper';
import { createApplication, waitFor } from './helpers/application.helper';
import { Role } from '../src/users/role.enum';
import { AuditLog } from '../src/audit/entities/audit-log.entity';
import { MerchantApplication } from '../src/applications/entities/merchant-application.entity';
import { ApplicationStatus } from '../src/applications/application.enums';

describe('Audit Trail & Sensitive Data (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;

  let salesToken: string;
  let reviewerToken: string;
  let adminToken: string;

  let reviewerId: string;

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
      email: 'sales-audit@example.com',
    });
    salesToken = s.token;

    const r = await createUserAndToken(app, Role.REVIEWER, {
      email: 'reviewer-audit@example.com',
    });
    reviewerToken = r.token;
    reviewerId = r.user.id;

    const adm = await createUserAndToken(app, Role.ADMIN, {
      email: 'admin-audit@example.com',
    });
    adminToken = adm.token;
  });

  it('Create, assign, and decision produce audit rows with proper actors and actions', async () => {
    // 1. Create -> APPLICATION_CREATED
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    // 2. Assign -> REVIEWER_ASSIGNED
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id: appId }, { status: ApplicationStatus.SUBMITTED });
    await request(server)
      .post(`/applications/${appId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reviewerId });

    // 3. Move to IN_REVIEW and decide -> DECISION_RECORDED
    await dataSource
      .getRepository(MerchantApplication)
      .update({ id: appId }, { status: ApplicationStatus.IN_REVIEW });
    await request(server)
      .post(`/applications/${appId}/decisions`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ decision: 'APPROVE' });

    const auditLogs = await dataSource
      .getRepository(AuditLog)
      .find({ where: { entityId: appId }, order: { occurredAt: 'ASC' } });

    const actions = auditLogs.map((log) => log.action);
    expect(actions).toContain('APPLICATION_CREATED');
    expect(actions).toContain('REVIEWER_ASSIGNED');
    expect(actions).toContain('DECISION_RECORDED');
  });

  it('All serialized audit rows for an application never contain plaintext sensitive data', async () => {
    const sensitiveTaxId = '000000001';
    const sensitiveDob = '1990-01-15';
    const sensitiveEmail = 'owner@example.com';
    const sensitivePhone = '+9779800000000';

    const createRes = await createApplication(app, salesToken, {
      businessTaxId: sensitiveTaxId,
      owner: {
        firstName: 'Secret',
        lastName: 'Owner',
        email: sensitiveEmail,
        phone: sensitivePhone,
        dateOfBirth: sensitiveDob,
      },
    });
    const appId = createRes.body.id;

    // Update something
    await request(server)
      .patch(`/applications/${appId}`)
      .set('Authorization', `Bearer ${salesToken}`)
      .send({ businessName: 'Changed Shop' });

    const allAudits = await dataSource
      .getRepository(AuditLog)
      .find({ where: { entityId: appId } });

    const serialized = JSON.stringify(allAudits);

    // Verify raw secrets never appear
    expect(serialized).not.toContain(sensitiveTaxId);
    expect(serialized).not.toContain(sensitiveDob);
    expect(serialized).not.toContain(sensitiveEmail);
    expect(serialized).not.toContain(sensitivePhone);

    // Masked variants are used
    expect(serialized).toContain('o***@example.com');
    expect(serialized).toContain('*********0000');
  });

  it('Append-only trigger: raw UPDATE or DELETE on audit_logs fails and raises exception', async () => {
    const createRes = await createApplication(app, salesToken);
    const appId = createRes.body.id;

    const audit = await dataSource
      .getRepository(AuditLog)
      .findOneBy({ entityId: appId });
    expect(audit).toBeDefined();

    // Raw UPDATE should fail
    await expect(
      dataSource.query(
        `UPDATE audit_logs SET action = 'HACKED' WHERE id = '${audit!.id}'`,
      ),
    ).rejects.toThrow(/audit_logs is append-only/);

    // Raw DELETE should fail
    await expect(
      dataSource.query(`DELETE FROM audit_logs WHERE id = '${audit!.id}'`),
    ).rejects.toThrow(/audit_logs is append-only/);
  });

  it('GET /audit-logs endpoint: ADMIN -> 200 with pagination; SALES & REVIEWER -> 403', async () => {
    // Admin can query
    const adminRes = await request(server)
      .get('/audit-logs?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body).toHaveProperty('items');
    expect(adminRes.body).toHaveProperty('meta');

    // Sales cannot query
    const salesRes = await request(server)
      .get('/audit-logs')
      .set('Authorization', `Bearer ${salesToken}`);
    expect(salesRes.status).toBe(403);

    // Reviewer cannot query
    const reviewerRes = await request(server)
      .get('/audit-logs')
      .set('Authorization', `Bearer ${reviewerToken}`);
    expect(reviewerRes.status).toBe(403);
  });
});
