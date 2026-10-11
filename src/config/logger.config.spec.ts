import { ConfigService } from '@nestjs/config';
import pino from 'pino';
import { createPinoHttpConfig, PINO_REDACT_PATHS } from './logger.config';

describe('Logger Configuration and Redaction', () => {
  it('contains all required sensitive fields in redaction paths', () => {
    expect(PINO_REDACT_PATHS).toContain('req.headers.authorization');
    expect(PINO_REDACT_PATHS).toContain('req.headers.cookie');
    expect(PINO_REDACT_PATHS).toContain('req.body.password');
    expect(PINO_REDACT_PATHS).toContain('*.passwordHash');
    expect(PINO_REDACT_PATHS).toContain('*.token');
    expect(PINO_REDACT_PATHS).toContain('*.accessToken');
  });

  it('redacts sensitive headers when logging', () => {
    let output = '';
    const destination = {
      write: (msg: string) => {
        output += msg;
      },
    };

    const logger = pino(
      {
        redact: {
          paths: PINO_REDACT_PATHS,
          censor: '[REDACTED]',
        },
      },
      destination,
    );

    logger.info({
      req: {
        headers: {
          authorization: 'Bearer super-secret-token',
          cookie: 'session=12345',
          'content-type': 'application/json',
        },
      },
      user: {
        token: 'secret-token-xyz',
        passwordHash: '$argon2id$v=19$m=65536...',
      },
    });

    const parsed = JSON.parse(output) as Record<string, unknown>;
    const req = parsed['req'] as { headers: Record<string, unknown> };
    const user = parsed['user'] as Record<string, unknown>;

    expect(req.headers['authorization']).toBe('[REDACTED]');
    expect(req.headers['cookie']).toBe('[REDACTED]');
    expect(req.headers['content-type']).toBe('application/json');
    expect(user['token']).toBe('[REDACTED]');
    expect(user['passwordHash']).toBe('[REDACTED]');
  });

  it('omits request body completely in serializer', () => {
    const configService = {
      get: (key: string) => (key === 'env' ? 'development' : 'info'),
    } as unknown as ConfigService;

    const pinoParams = createPinoHttpConfig(configService);
    const serializers = (pinoParams.pinoHttp as Record<string, unknown>)?.[
      'serializers'
    ] as {
      req: (req: { body?: unknown; method: string }) => Record<string, unknown>;
    };

    const serializedReq = serializers.req({
      body: { password: 'secret-password', sensitiveData: '123' },
      method: 'POST',
    });

    expect(serializedReq['body']).toBeUndefined();
    expect(serializedReq['method']).toBe('POST');
  });
});
