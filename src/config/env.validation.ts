import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required().allow(''),
  DB_NAME: Joi.string().required(),
  DB_NAME_TEST: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),

  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET must be at least 32 characters long',
    'any.required': 'JWT_SECRET is required',
  }),
  JWT_EXPIRES_IN: Joi.string().default('15m'),
  JWT_ISSUER: Joi.string().default('merchant-api'),
  JWT_AUDIENCE: Joi.string().default('merchant-api-clients'),

  SEED_ADMIN_PASSWORD: Joi.string().optional(),
  SEED_REVIEWER_PASSWORD: Joi.string().optional(),
  SEED_SALES_PASSWORD: Joi.string().optional(),

  THROTTLE_ENABLED: Joi.boolean().default(true),
  THROTTLE_TTL: Joi.number().default(60),
  THROTTLE_LIMIT: Joi.number().default(100),
});
