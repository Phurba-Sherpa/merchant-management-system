import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import { Server } from 'node:http';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

describe('Queue Plumbing (Phase 6 Connection Only)', () => {
  let app: INestApplication;
  let server: Server;
  let riskQueue: Queue;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();

    const rawServer: unknown = app.getHttpServer();
    server = rawServer as Server;
    riskQueue = app.get<Queue>(getQueueToken('risk-review'));
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots cleanly and health check is green', async () => {
    const response = await request(server).get('/health').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      info: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('risk-review queue is registered and has 0 enqueued jobs', async () => {
    expect(riskQueue).toBeDefined();
    const count = await riskQueue.count();
    expect(count).toBe(0);
  });
});
