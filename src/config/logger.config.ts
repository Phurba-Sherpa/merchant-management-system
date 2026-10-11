import { Params } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';

export const PINO_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  '*.passwordHash',
  '*.token',
  '*.accessToken',
];

export const createPinoHttpConfig = (configService: ConfigService): Params => {
  const isProduction = configService.get<string>('env') === 'production';
  const isTest = configService.get<string>('env') === 'test';
  const logLevel = configService.get<string>('logLevel') ?? 'info';

  return {
    pinoHttp: {
      level: isTest ? 'silent' : logLevel,
      redact: {
        paths: PINO_REDACT_PATHS,
        censor: '[REDACTED]',
      },
      serializers: {
        req(req: { body?: unknown; [key: string]: unknown }) {
          // Never log request bodies to prevent accidental credential or sensitive data leakage
          const safeReq = { ...req };
          delete safeReq.body;
          return safeReq;
        },
      },
      transport:
        !isProduction && !isTest
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: true,
              },
            }
          : undefined,
    },
  };
};
