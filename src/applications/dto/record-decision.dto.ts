import { IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DecisionType } from '../application.enums';

export class RecordDecisionDto {
  @ApiProperty({ enum: DecisionType, example: DecisionType.APPROVE })
  @IsEnum(DecisionType)
  decision!: DecisionType;

  @ApiPropertyOptional({
    example: 'Business details and risk assessment verified.',
  })
  @IsOptional()
  @IsString()
  @Length(10, 2000, {
    message: 'comment must be between 10 and 2000 characters if provided',
  })
  comment?: string;
}
