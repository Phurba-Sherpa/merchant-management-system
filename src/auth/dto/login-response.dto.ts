import { ApiProperty } from '@nestjs/swagger';
import { UserResponseDto } from './user-response.dto';

export class LoginResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  accessToken!: string;

  @ApiProperty({ example: '15m', description: 'Token expiration duration' })
  expiresIn!: string;

  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
