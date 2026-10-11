import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

import { Server } from 'node:http';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) returns 200 and healthy status for postgres and redis', async () => {
    const server = app.getHttpServer() as unknown as Server;
    const response = await request(server).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });
});
