import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignReviewerDto {
  @ApiProperty({ example: '3f0c2a84-0000-0000-0000-000000000001' })
  @IsUUID()
  reviewerId!: string;
}
