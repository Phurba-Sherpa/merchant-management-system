import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { UsersService } from '../../users/users.service';
import { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Unauthorized');
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      throw new UnauthorizedException('Unauthorized');
    }

    let payload: { sub: string };
    try {
      // Pin algorithm to HS256 and enforce issuer/audience verification to prevent algorithm confusion attacks
      payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: this.configService.get<string>('jwt.secret'),
        algorithms: ['HS256'],
        issuer: this.configService.get<string>('jwt.issuer'),
        audience: this.configService.get<string>('jwt.audience'),
      });
    } catch {
      throw new UnauthorizedException('Unauthorized');
    }

    if (!payload?.sub) {
      throw new UnauthorizedException('Unauthorized');
    }

    // Role and active status loaded from database on every request (Assumption A7)
    // Ensures account deactivation or role revoking takes effect immediately
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Unauthorized');
    }

    request.user = {
      id: user.id,
      role: user.role,
    };

    return true;
  }
}
