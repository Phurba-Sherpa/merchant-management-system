import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus, RiskStatus } from '../application.enums';

export const SORT_COLUMN_MAP: Record<string, string> = {
  createdAt: 'application.createdAt',
  updatedAt: 'application.updatedAt',
  submittedAt: 'application.submittedAt',
};

export class QueryApplicationsDto {
  @ApiPropertyOptional({ enum: ApplicationStatus })
  @IsOptional()
  @IsEnum(ApplicationStatus)
  status?: ApplicationStatus;

  @ApiPropertyOptional({ enum: RiskStatus })
  @IsOptional()
  @IsEnum(RiskStatus)
  riskStatus?: RiskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedReviewerId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'submittedAt'] })
  @IsOptional()
  @IsIn(['createdAt', 'updatedAt', 'submittedAt'])
  sort?: string = 'createdAt';

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'] })
  @IsOptional()
  @IsIn(['ASC', 'DESC', 'asc', 'desc'])
  order?: 'ASC' | 'DESC' | 'asc' | 'desc' = 'DESC';
}
