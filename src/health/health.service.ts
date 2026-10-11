import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import * as net from 'net';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  info: {
    postgres: 'up' | 'down';
    redis: 'up' | 'down';
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  async checkHealth(): Promise<HealthCheckResult> {
    const [pgOk, redisOk] = await Promise.all([
      this.checkPostgres(),
      this.checkRedis(),
    ]);

    const isHealthy = pgOk && redisOk;
    return {
      status: isHealthy ? 'ok' : 'error',
      info: {
        postgres: pgOk ? 'up' : 'down',
        redis: redisOk ? 'up' : 'down',
      },
    };
  }

  async checkPostgres(): Promise<boolean> {
    const client = new Client({
      host: this.configService.get<string>('database.host'),
      port: this.configService.get<number>('database.port'),
      user: this.configService.get<string>('database.user'),
      password: this.configService.get<string>('database.password'),
      database: this.configService.get<string>('database.name'),
      connectionTimeoutMillis: 3000,
    });

    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      return true;
    } catch {
      try {
        await client.end();
      } catch {
        // ignore error during disconnect
      }
      return false;
    }
  }

  async checkRedis(): Promise<boolean> {
    const host = this.configService.get<string>('redis.host') ?? 'localhost';
    const port = this.configService.get<number>('redis.port') ?? 6379;

    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.on('connect', () => {
        socket.write('PING\r\n');
      });

      socket.on('data', (data) => {
        if (data.toString().includes('PONG')) {
          socket.destroy();
          resolve(true);
        } else {
          socket.destroy();
          resolve(false);
        }
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, host);
    });
  }
}
