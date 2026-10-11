import { Test, TestingModule } from '@nestjs/testing';
import {
  DiscoveryModule,
  DiscoveryService,
  MetadataScanner,
  Reflector,
} from '@nestjs/core';
import { AppModule } from '../app.module';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { ROLES_KEY } from '../common/decorators/roles.decorator';

describe('Route Inventory Security Audit', () => {
  /**
   * Routes intentionally allowed without @Roles or @Public (open to all authenticated users).
   * Every entry MUST have a comment explaining the rationale.
   */
  const ANY_AUTHENTICATED_ROLE_ALLOWLIST: Record<string, string> = {
    // GET /auth/me returns the profile for any active authenticated user regardless of their role
    'AuthController.getMe':
      'Accessible to all authenticated users regardless of role to retrieve own identity',
  };

  let moduleRef: TestingModule;

  afterAll(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  it('every route handler is explicitly @Public(), role-guarded with @Roles(...), or documented in allowlist', async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();

    const discoveryService = moduleRef.get(DiscoveryService);
    const metadataScanner = moduleRef.get(MetadataScanner);
    const reflector = moduleRef.get(Reflector);

    const controllers = discoveryService.getControllers();
    const uncoveredRoutes: string[] = [];

    for (const controllerWrapper of controllers) {
      const rawWrapper = controllerWrapper as {
        instance?: unknown;
        metatype?: (new (...args: unknown[]) => unknown) & { name: string };
      };
      const instance = rawWrapper.instance;
      const metatype = rawWrapper.metatype;
      if (!instance || !metatype) continue;

      const prototype = Object.getPrototypeOf(instance) as Record<
        string,
        (...args: unknown[]) => unknown
      >;
      const methodNames = metadataScanner.getAllMethodNames(prototype);

      for (const methodName of methodNames) {
        const handler = prototype[methodName];
        if (typeof handler !== 'function') continue;

        const isPublic = reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          handler,
          metatype,
        ]);
        const roles = reflector.getAllAndOverride<unknown[]>(ROLES_KEY, [
          handler,
          metatype,
        ]);

        const routeIdentifier = `${metatype.name}.${methodName}`;

        if (!isPublic && (!roles || roles.length === 0)) {
          if (!ANY_AUTHENTICATED_ROLE_ALLOWLIST[routeIdentifier]) {
            uncoveredRoutes.push(routeIdentifier);
          }
        }
      }
    }

    expect(uncoveredRoutes).toEqual([]);
  });
});
