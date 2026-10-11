import { INestApplication, Controller, Get } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import * as jwt from 'jsonwebtoken';
import { DataSource } from 'typeorm';
import { Server } from 'node:http';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { resetDb } from './helpers/test-app.helper';
import { createUserAndToken } from './helpers/auth.helper';
import { Role } from '../src/users/role.enum';
import { Roles } from '../src/common/decorators/roles.decorator';
import { User } from '../src/users/user.entity';

@Controller('test-role-gate')
class TestRoleGateController {
  @Roles(Role.ADMIN)
  @Get('admin-only')
  adminOnly(): { success: boolean } {
    return { success: true };
  }
}

describe('Authentication and Authorization (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let server: Server;

  const jwtSecret =
    process.env.JWT_SECRET ??
    'super-secret-jwt-key-that-is-at-least-32-chars-long-strictly-for-dev';
  const jwtIssuer = process.env.JWT_ISSUER ?? 'merchant-api';
  const jwtAudience = process.env.JWT_AUDIENCE ?? 'merchant-api-clients';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.THROTTLE_ENABLED = 'false';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestRoleGateController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    dataSource = app.get(DataSource);
    const rawServer: unknown = app.getHttpServer();
    server = rawServer as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(dataSource);
  });

  describe('POST /auth/login', () => {
    it('successfully logs in with valid credentials and does not expose passwordHash', async () => {
      const { user } = await createUserAndToken(app, Role.SALES, {
        email: 'sales-login-test@example.com',
      });

      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'sales-login-test@example.com',
          password: 'TestPassword123!',
        })
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(typeof body['accessToken']).toBe('string');
      expect(body['expiresIn']).toBe('15m');

      const returnedUser = body['user'] as Record<string, unknown>;
      expect(returnedUser['id']).toBe(user.id);
      expect(returnedUser['email']).toBe('sales-login-test@example.com');
      expect(returnedUser['role']).toBe(Role.SALES);
      expect('passwordHash' in returnedUser).toBe(false);
    });

    it('returns 401 with unified shape on unknown email', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!',
        })
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
      expect(body['error']).toBe('Unauthorized');
      expect(body['message']).toBe('Invalid credentials');
    });

    it('returns 401 with unified shape on wrong password', async () => {
      await createUserAndToken(app, Role.ADMIN, {
        email: 'admin-wrong-pass@example.com',
      });

      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'admin-wrong-pass@example.com',
          password: 'IncorrectPassword!',
        })
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
      expect(body['error']).toBe('Unauthorized');
      expect(body['message']).toBe('Invalid credentials');
    });

    it('returns 401 with identical shape when user account is deactivated', async () => {
      await createUserAndToken(app, Role.REVIEWER, {
        email: 'inactive-user@example.com',
        isActive: false,
      });

      const response = await request(server)
        .post('/auth/login')
        .send({
          email: 'inactive-user@example.com',
          password: 'TestPassword123!',
        })
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
      expect(body['error']).toBe('Unauthorized');
      expect(body['message']).toBe('Invalid credentials');
    });
  });

  describe('JWT Verification & Guard Security (GET /auth/me)', () => {
    it('returns 200 with current user profile when valid token is supplied', async () => {
      const { user, token } = await createUserAndToken(app, Role.SALES);

      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body['id']).toBe(user.id);
      expect(body['email']).toBe(user.email);
      expect(body['role']).toBe(Role.SALES);
      expect('passwordHash' in body).toBe(false);
    });

    it('returns 401 when no token is provided', async () => {
      const response = await request(server).get('/auth/me').expect(401);
      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
      expect(body['error']).toBe('Unauthorized');
    });

    it('returns 401 when token header is malformed', async () => {
      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', 'InvalidFormat')
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
    });

    it('returns 401 when token is expired', async () => {
      const { user } = await createUserAndToken(app, Role.SALES);

      const expiredToken = jwt.sign({ sub: user.id }, jwtSecret, {
        algorithm: 'HS256',
        expiresIn: -60,
        issuer: jwtIssuer,
        audience: jwtAudience,
      });

      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`)
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
      expect(body['error']).toBe('Unauthorized');
    });

    it('returns 401 when token is signed with a different secret', async () => {
      const { user } = await createUserAndToken(app, Role.SALES);

      const invalidSecretToken = jwt.sign(
        { sub: user.id },
        'different-secret-key-that-is-at-least-32-chars-long!',
        {
          algorithm: 'HS256',
          expiresIn: '15m',
          issuer: jwtIssuer,
          audience: jwtAudience,
        },
      );

      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${invalidSecretToken}`)
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
    });

    it('returns 401 when token is signed with alg: none', async () => {
      const { user } = await createUserAndToken(app, Role.SALES);

      const header = Buffer.from(
        JSON.stringify({ alg: 'none', typ: 'JWT' }),
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({
          sub: user.id,
          iss: jwtIssuer,
          aud: jwtAudience,
          exp: Math.floor(Date.now() / 1000) + 900,
        }),
      ).toString('base64url');
      const noneToken = `${header}.${payload}.`;

      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${noneToken}`)
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
    });

    it('returns 401 when user is deactivated in the database after token issuance (A7)', async () => {
      const { user, token } = await createUserAndToken(app, Role.SALES);

      // Directly deactivate the user in database
      const userRepo = dataSource.getRepository(User);
      await userRepo.update(user.id, { isActive: false });

      const response = await request(server)
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(401);
      expect(body['error']).toBe('Unauthorized');
    });
  });

  describe('Role Gate Authorization (RolesGuard)', () => {
    it('returns 403 Forbidden when a SALES user accesses an ADMIN-only route', async () => {
      const { token } = await createUserAndToken(app, Role.SALES);

      const response = await request(server)
        .get('/test-role-gate/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      const body = response.body as Record<string, unknown>;
      expect(body['statusCode']).toBe(403);
      expect(body['error']).toBe('Forbidden');
    });

    it('returns 200 OK when an ADMIN user accesses an ADMIN-only route', async () => {
      const { token } = await createUserAndToken(app, Role.ADMIN);

      const response = await request(server)
        .get('/test-role-gate/admin-only')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const body = response.body as Record<string, unknown>;
      expect(body['success']).toBe(true);
    });
  });
});
