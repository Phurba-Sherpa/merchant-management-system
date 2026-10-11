import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import * as path from 'path';

export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
  dotenv.config();

  const testDbName = process.env.DB_NAME_TEST ?? 'app_test';

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: testDbName,
    synchronize: false,
    migrationsRun: false,
    uuidExtension: 'pgcrypto',
    entities: [path.join(__dirname, '..', 'src', '**', '*.entity.{ts,js}')],
    migrations: [
      path.join(__dirname, '..', 'src', 'database', 'migrations', '*.{ts,js}'),
    ],
  });

  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
