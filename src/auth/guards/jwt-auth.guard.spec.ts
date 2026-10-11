import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UsersService } from '../../users/users.service';
import { Role } from '../../users/role.enum';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let jwtService: { verifyAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let usersService: { findById: jest.Mock };

  const createMockContext = (
    headers: Record<string, string> = {},
    reqObj: Record<string, unknown> = {},
  ): { context: ExecutionContext; request: Record<string, unknown> } => {
    const request = {
      headers,
      ...reqObj,
    };

    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    return { context, request };
  };

  beforeEach(() => {
    reflector = new Reflector();
    jwtService = { verifyAsync: jest.fn() };
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        const config: Record<string, string> = {
          'jwt.secret': 'super-secret-jwt-key-32-chars-minimum',
          'jwt.issuer': 'merchant-api',
          'jwt.audience': 'merchant-api-clients',
        };
        return config[key];
      }),
    };
    usersService = { findById: jest.fn() };

    guard = new JwtAuthGuard(
      reflector,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      usersService as unknown as UsersService,
    );
  });

  it('allows public routes with @Public() decorator without checking headers', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { context } = createMockContext();

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('throws 401 when Authorization header is missing', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext();

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Unauthorized'),
    );
  });

  it('throws 401 when Authorization header does not start with Bearer', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    const { context } = createMockContext({
      authorization: 'Basic dXNlcjpwYXNz',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Unauthorized'),
    );
  });

  it('throws 401 when token verification fails (expired or invalid signature)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));
    const { context } = createMockContext({
      authorization: 'Bearer bad-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Unauthorized'),
    );
  });

  it('throws 401 when user is deactivated in database (A7)', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid' });
    usersService.findById.mockResolvedValue({
      id: 'user-uuid',
      isActive: false,
      role: Role.SALES,
    });

    const { context } = createMockContext({
      authorization: 'Bearer valid-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Unauthorized'),
    );
  });

  it('attaches AuthenticatedUser to request when token and database user are valid', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    jwtService.verifyAsync.mockResolvedValue({ sub: 'user-uuid' });
    usersService.findById.mockResolvedValue({
      id: 'user-uuid',
      isActive: true,
      role: Role.ADMIN,
    });

    const { context, request } = createMockContext({
      authorization: 'Bearer valid-token',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request['user']).toEqual({
      id: 'user-uuid',
      role: Role.ADMIN,
    });
  });
});
