export interface AppConfig {
  env: string;
  port: number;
  logLevel: string;
  database: {
    host: string;
    port: number;
    user: string;
    password?: string;
    name: string;
    testName: string;
  };
  redis: {
    host: string;
    port: number;
  };
  jwt: {
    secret: string;
    expiresIn: string;
    issuer: string;
    audience: string;
  };
  seed: {
    adminPassword?: string;
    reviewerPassword?: string;
    salesPassword?: string;
  };
  throttler: {
    enabled: boolean;
    ttl: number;
    limit: number;
  };
}

export default (): AppConfig => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    user: process.env.DB_USER ?? '',
    password: process.env.DB_PASSWORD,
    name:
      process.env.NODE_ENV === 'test'
        ? (process.env.DB_NAME_TEST ?? 'app_test')
        : (process.env.DB_NAME ?? 'merchant_app'),
    testName: process.env.DB_NAME_TEST ?? 'app_test',
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? '',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    issuer: process.env.JWT_ISSUER ?? 'merchant-api',
    audience: process.env.JWT_AUDIENCE ?? 'merchant-api-clients',
  },
  seed: {
    adminPassword: process.env.SEED_ADMIN_PASSWORD,
    reviewerPassword: process.env.SEED_REVIEWER_PASSWORD,
    salesPassword: process.env.SEED_SALES_PASSWORD,
  },
  throttler: {
    enabled: process.env.THROTTLE_ENABLED !== 'false',
    ttl: parseInt(process.env.THROTTLE_TTL ?? '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '100', 10),
  },
});
