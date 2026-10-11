import {
  Injectable,
  UnauthorizedException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Precompute a dummy argon2id hash at startup for timing-attack mitigation
    this.dummyHash = await argon2.hash(
      'dummy-mitigation-password-timing-safe',
      {
        type: argon2.argon2id,
      },
    );
  }

  async login(loginDto: LoginDto): Promise<LoginResponseDto> {
    const normalizedEmail = loginDto.email.trim().toLowerCase();
    const user =
      await this.usersService.findByEmailWithPassword(normalizedEmail);

    if (!user) {
      // Execute argon2.verify against dummy hash to prevent response-time email enumeration
      if (this.dummyHash) {
        await argon2.verify(this.dummyHash, loginDto.password);
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      // Inactive account returns the exact same error as invalid password to prevent account status leaking
      throw new UnauthorizedException('Invalid credentials');
    }

    // Token payload contains only { sub: user.id } (no roles, no email)
    const payload = { sub: user.id };
    const accessToken = await this.jwtService.signAsync(payload);
    const expiresIn = this.configService.get<string>('jwt.expiresIn') ?? '15m';

    return {
      accessToken,
      expiresIn,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  async getCurrentUser(userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findByIdOrFail(userId);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }
}
