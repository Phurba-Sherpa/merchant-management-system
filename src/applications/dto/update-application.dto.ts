import { OmitType, PartialType } from '@nestjs/swagger';
import { ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import {
  CreateApplicationDto,
  OwnerDto,
  ProcessingDto,
} from './create-application.dto';

export class UpdateOwnerDto extends PartialType(OwnerDto) {}
export class UpdateProcessingDto extends PartialType(ProcessingDto) {}

export class UpdateApplicationDto extends PartialType(
  OmitType(CreateApplicationDto, ['owner', 'processing'] as const),
) {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateOwnerDto)
  owner?: UpdateOwnerDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateProcessingDto)
  processing?: UpdateProcessingDto;
}
