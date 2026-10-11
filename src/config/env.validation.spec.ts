import { envValidationSchema } from './env.validation';

describe('envValidationSchema', () => {
  const validBaseEnv = {
    DB_HOST: 'localhost',
    DB_PORT: 5432,
    DB_USER: 'postgres',
    DB_PASSWORD: 'password',
    DB_NAME: 'merchant_app',
    DB_NAME_TEST: 'app_test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: 6379,
    JWT_SECRET: 'a'.repeat(32),
  };

  it('validates a correct environment configuration', () => {
    const result = envValidationSchema.validate(validBaseEnv);
    expect(result.error).toBeUndefined();
    const validated = result.value as Record<string, unknown>;
    expect(validated['NODE_ENV']).toBe('development');
    expect(validated['PORT']).toBe(3000);
  });

  it('fails fast when JWT_SECRET is missing', () => {
    const invalidEnv = { ...validBaseEnv };
    delete (invalidEnv as Record<string, unknown>).JWT_SECRET;
    const { error } = envValidationSchema.validate(invalidEnv);
    expect(error).toBeDefined();
    expect(error?.message).toContain('JWT_SECRET is required');
  });

  it('fails fast when JWT_SECRET is shorter than 32 characters', () => {
    const invalidEnv = { ...validBaseEnv, JWT_SECRET: 'short-secret' };
    const { error } = envValidationSchema.validate(invalidEnv);
    expect(error).toBeDefined();
    expect(error?.message).toContain(
      'JWT_SECRET must be at least 32 characters long',
    );
  });

  it('fails fast when database configuration is missing', () => {
    const invalidEnv = { ...validBaseEnv };
    delete (invalidEnv as Record<string, unknown>).DB_HOST;
    const { error } = envValidationSchema.validate(invalidEnv);
    expect(error).toBeDefined();
    expect(error?.message).toContain('"DB_HOST" is required');
  });
});
