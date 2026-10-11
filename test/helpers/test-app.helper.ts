import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';

export interface TestAppContext {
  app: INestApplication;
  dataSource: DataSource;
  moduleFixture: TestingModule;
}

export async function createTestApp(): Promise<TestAppContext> {
  process.env.NODE_ENV = 'test';
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  configureApp(app);
  await app.init();

  const dataSource = app.get(DataSource);
  return { app, dataSource, moduleFixture };
}

export async function resetDb(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;
  if (!entities || entities.length === 0) return;

  const tableNames = entities
    .map((entity) => `"${entity.tableName}"`)
    .join(', ');

  await dataSource.query(
    `TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE;`,
  );
}
