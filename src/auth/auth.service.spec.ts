import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { Role } from '../users/role.enum';
import { User } from '../users/user.entity';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn().mockResolvedValue('$argon2id$v=19$dummy-hash'),
  verify: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: {
    findByEmailWithPassword: jest.Mock;
    findByIdOrFail: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };

  const plainPassword = 'CorrectPassword123!';
  const validPasswordHash = '$argon2id$v=19$user-hash';

  beforeEach(async () => {
    jest.clearAllMocks();

    usersService = {
      findByEmailWithPassword: jest.fn(),
      findByIdOrFail: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-jwt-token'),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'jwt.expiresIn') return '15m';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    await service.onModuleInit();
  });

  describe('login', () => {
    const mockUser: Partial<User> = {
      id: 'user-uuid-1',
      email: 'admin@example.com',
      fullName: 'System Admin',
      role: Role.ADMIN,
      passwordHash: validPasswordHash,
      isActive: true,
    };

    it('successfully authenticates active user with correct password and returns JWT without roles in payload', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: ' Admin@Example.com ',
        password: plainPassword,
      });

      expect(usersService.findByEmailWithPassword).toHaveBeenCalledWith(
        'admin@example.com',
      );
      // Token payload must only contain sub (no roles, no email)
      expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'user-uuid-1' });
      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        expiresIn: '15m',
        user: {
          id: 'user-uuid-1',
          email: 'admin@example.com',
          fullName: 'System Admin',
          role: Role.ADMIN,
        },
      });
    });

    it('fails with "Invalid credentials" when email is unknown (exercises dummy-hash path)', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(null);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'unknown@example.com',
          password: 'some-password',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      // Asserts that dummy hash verification ran to prevent timing enumeration
      expect(argon2.verify).toHaveBeenCalledWith(
        '$argon2id$v=19$dummy-hash',
        'some-password',
      );
    });

    it('fails with "Invalid credentials" when password does not match', async () => {
      usersService.findByEmailWithPassword.mockResolvedValue(mockUser);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({
          email: 'admin@example.com',
          password: 'WrongPassword!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));

      expect(argon2.verify).toHaveBeenCalledWith(
        validPasswordHash,
        'WrongPassword!',
      );
    });

    it('fails with identical "Invalid credentials" error when user account is deactivated', async () => {
      const inactiveUser = {
        ...mockUser,
        isActive: false,
      };
      usersService.findByEmailWithPassword.mockResolvedValue(inactiveUser);
      (argon2.verify as jest.Mock).mockResolvedValue(true);

      await expect(
        service.login({
          email: 'admin@example.com',
          password: plainPassword,
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
    });
  });

  describe('getCurrentUser', () => {
    it('returns the current user without sensitive fields', async () => {
      usersService.findByIdOrFail.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'admin@example.com',
        fullName: 'System Admin',
        role: Role.ADMIN,
      });

      const result = await service.getCurrentUser('user-uuid-1');
      expect(result).toEqual({
        id: 'user-uuid-1',
        email: 'admin@example.com',
        fullName: 'System Admin',
        role: Role.ADMIN,
      });
      expect('passwordHash' in result).toBe(false);
    });
  });
});
