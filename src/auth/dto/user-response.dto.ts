import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../../users/role.enum';

export class UserResponseDto {
  @ApiProperty({ example: 'a9ed3b05-b380-4a2c-a0af-68438441a2cc' })
  id!: string;

  @ApiProperty({ example: 'admin@example.com' })
  email!: string;

  @ApiProperty({ example: 'System Admin' })
  fullName!: string;

  @ApiProperty({ enum: Role, example: Role.ADMIN })
  role!: Role;
}
