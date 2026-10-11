import { DataSource, DataSourceOptions } from 'typeorm';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables for TypeORM CLI operations
dotenv.config();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database:
    process.env.NODE_ENV === 'test'
      ? (process.env.DB_NAME_TEST ?? 'app_test')
      : (process.env.DB_NAME ?? 'merchant_app'),
  synchronize: false,
  migrationsRun: false,
  uuidExtension: 'pgcrypto',
  entities: [path.join(__dirname, '..', '**', '*.entity.{ts,js}')],
  migrations: [path.join(__dirname, 'migrations', '*.{ts,js}')],
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
