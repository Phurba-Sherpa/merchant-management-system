import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              const config: Record<string, unknown> = {
                'database.host': 'localhost',
                'database.port': 5432,
                'database.user': 'postgres',
                'database.password': 'postgres',
                'database.name': 'merchant_app',
                'redis.host': 'localhost',
                'redis.port': 6379,
              };
              return config[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns ok status when postgres and redis are up', async () => {
    jest.spyOn(service, 'checkPostgres').mockResolvedValue(true);
    jest.spyOn(service, 'checkRedis').mockResolvedValue(true);

    const result = await service.checkHealth();
    expect(result).toEqual({
      status: 'ok',
      info: {
        postgres: 'up',
        redis: 'up',
      },
    });
  });

  it('returns error status when postgres is down', async () => {
    jest.spyOn(service, 'checkPostgres').mockResolvedValue(false);
    jest.spyOn(service, 'checkRedis').mockResolvedValue(true);

    const result = await service.checkHealth();
    expect(result).toEqual({
      status: 'error',
      info: {
        postgres: 'down',
        redis: 'up',
      },
    });
  });
});
