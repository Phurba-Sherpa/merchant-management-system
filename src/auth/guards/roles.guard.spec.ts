import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Role } from '../../users/role.enum';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createMockContext = (user?: AuthenticatedUser): ExecutionContext => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when no role metadata is set on handler or class', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const context = createMockContext({
      id: 'user-1',
      role: Role.SALES,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when user role matches required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.ADMIN, Role.REVIEWER]);

    const context = createMockContext({
      id: 'admin-1',
      role: Role.ADMIN,
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException (403) when user role is not in allowed list', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    const context = createMockContext({
      id: 'sales-1',
      role: Role.SALES,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('prefers handler-level metadata over class-level metadata via Reflector', () => {
    const getAllAndOverrideSpy = jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Role.REVIEWER]);

    const context = createMockContext({
      id: 'reviewer-1',
      role: Role.REVIEWER,
    });

    const canActivate = guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(getAllAndOverrideSpy).toHaveBeenCalledWith('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
