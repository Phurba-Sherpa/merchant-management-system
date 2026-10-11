import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

import type { SignOptions } from 'jsonwebtoken';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: (configService.get<string>('jwt.expiresIn') ??
            '15m') as unknown as SignOptions['expiresIn'],
          issuer: configService.get<string>('jwt.issuer') ?? 'merchant-api',
          audience:
            configService.get<string>('jwt.audience') ?? 'merchant-api-clients',
        },
        verifyOptions: {
          algorithms: ['HS256'],
          issuer: configService.get<string>('jwt.issuer') ?? 'merchant-api',
          audience:
            configService.get<string>('jwt.audience') ?? 'merchant-api-clients',
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
