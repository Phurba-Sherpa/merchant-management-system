import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { Server } from 'node:http';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Login Rate Limiting (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    // Explicitly enable throttler
    process.env.THROTTLE_ENABLED = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const rawServer: unknown = app.getHttpServer();
    server = rawServer as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rate limits POST /auth/login after 5 attempts returning 429', async () => {
    // Send 5 login attempts
    for (let i = 0; i < 5; i++) {
      await request(server)
        .post('/auth/login')
        .send({
          email: 'rate-limit-test@example.com',
          password: 'WrongPassword!',
        })
        .expect(401);
    }

    // 6th attempt should be blocked by ThrottlerGuard with 429
    const response = await request(server)
      .post('/auth/login')
      .send({
        email: 'rate-limit-test@example.com',
        password: 'WrongPassword!',
      })
      .expect(429);

    const body = response.body as Record<string, unknown>;
    expect(body['statusCode']).toBe(429);
  });
});
