import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'node:http';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

describe('App Bootstrap & Cross-Cutting Concerns (e2e)', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
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

  it('/health (GET) returns 200 and healthy status for postgres and redis', async () => {
    const response = await request(server).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('/docs (GET) loads Swagger UI documentation', async () => {
    const response = await request(server).get('/docs/');
    expect([200, 301]).toContain(response.status);
    if (response.status === 200) {
      expect(response.text).toContain('swagger-ui');
    }
  });

  it('unhandled route returns unified error structure from AllExceptionsFilter', async () => {
    const response = await request(server)
      .get('/non-existent-route-for-testing')
      .expect(404);

    const body = response.body as Record<string, unknown>;
    expect(body['statusCode']).toBe(404);
    expect(body['error']).toBe('Not Found');
    expect(body['message']).toBe('Cannot GET /non-existent-route-for-testing');
    expect(body['path']).toBe('/non-existent-route-for-testing');
    expect(typeof body['timestamp']).toBe('string');
  });
});
