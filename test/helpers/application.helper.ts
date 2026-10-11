import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { Server } from 'node:http';

export const VALID_APPLICATION_PAYLOAD = {
  businessName: 'Everest Coffee',
  legalBusinessName: 'Everest Coffee Roasters Pvt Ltd',
  businessType: 'CORPORATION',
  mcc: '5499',
  website: 'https://example.com',
  businessTaxId: '000000001',
  owner: {
    firstName: 'Test',
    lastName: 'Owner',
    email: 'owner@example.com',
    phone: '+9779800000000',
    dateOfBirth: '1990-01-15',
  },
  processing: {
    expectedMonthlyVolume: 2500000,
    averageTicketSize: 4500,
    highestTicketSize: 20000,
    currency: 'USD',
  },
};

export async function createApplication(
  app: INestApplication,
  token: string,
  overrides: Record<string, unknown> = {},
) {
  const server = app.getHttpServer() as Server;
  const payload = {
    ...VALID_APPLICATION_PAYLOAD,
    ...overrides,
  };

  const res = await request(server)
    .post('/applications')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  return res;
}

export async function waitFor<T>(
  fn: () => Promise<T>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 25 } = options;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch {
      // ignore and retry until timeout
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}
