import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import * as argon2 from 'argon2';
import { User } from '../../src/users/user.entity';
import { Role } from '../../src/users/role.enum';
import { Server } from 'node:http';

export interface UserAndToken {
  user: User;
  token: string;
}

export async function createUserAndToken(
  app: INestApplication,
  role: Role,
  overrides: Partial<User> = {},
): Promise<UserAndToken> {
  const dataSource = app.get(DataSource);
  const userRepo = dataSource.getRepository(User);

  const plainPassword = 'TestPassword123!';
  // Fast argon2 cost parameters under test environment to speed up test execution
  const passwordHash = await argon2.hash(plainPassword, {
    type: argon2.argon2id,
    timeCost: 1,
    memoryCost: 4096,
  });

  const uniqueSuffix = Math.random().toString(36).substring(2, 8);
  const email =
    overrides.email ?? `${role.toLowerCase()}-${uniqueSuffix}@example.com`;

  const user = userRepo.create({
    email: email.trim().toLowerCase(),
    fullName: overrides.fullName ?? `${role} Test User`,
    role,
    passwordHash,
    isActive: overrides.isActive ?? true,
    ...overrides,
  });

  const savedUser = await userRepo.save(user);

  // If user is deactivated, return without signing in
  if (savedUser.isActive === false) {
    return { user: savedUser, token: '' };
  }

  // Sign in through the real /auth/login endpoint
  const rawServer: unknown = app.getHttpServer();
  const server = rawServer as Server;
  const loginRes = await request(server)
    .post('/auth/login')
    .send({ email: savedUser.email, password: plainPassword })
    .expect(200);

  const body = loginRes.body as { accessToken: string };
  return {
    user: savedUser,
    token: body.accessToken,
  };
}
