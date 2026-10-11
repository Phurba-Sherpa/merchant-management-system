import {
  IsString,
  IsEnum,
  IsOptional,
  IsUrl,
  Matches,
  IsEmail,
  IsInt,
  Min,
  Max,
  ValidateNested,
  Length,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BusinessType } from '../application.enums';

export class OwnerDto {
  @ApiProperty({ example: 'Test' })
  @IsString()
  @Length(1, 80)
  firstName!: string;

  @ApiProperty({ example: 'Owner' })
  @IsString()
  @Length(1, 80)
  lastName!: string;

  @ApiProperty({ example: 'owner@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : '',
  )
  @IsEmail()
  @Length(1, 254)
  email!: string;

  @ApiProperty({ example: '+9779800000000' })
  @IsString()
  @Matches(/^\+[1-9]\d{6,14}$/, {
    message: 'phone must be in E.164 format (e.g. +9779800000000)',
  })
  phone!: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dateOfBirth must be YYYY-MM-DD' })
  dateOfBirth?: string;
}

export class ProcessingDto {
  @ApiProperty({ example: 2500000 })
  @IsInt()
  @Min(1)
  @Max(9_000_000_000_000)
  expectedMonthlyVolume!: number;

  @ApiProperty({ example: 4500 })
  @IsInt()
  @Min(1)
  @Max(9_000_000_000_000)
  averageTicketSize!: number;

  @ApiProperty({ example: 20000 })
  @IsInt()
  @Min(1)
  @Max(9_000_000_000_000)
  highestTicketSize!: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency?: string = 'USD';
}

export class CreateApplicationDto {
  @ApiProperty({ example: 'Everest Coffee' })
  @IsString()
  @Length(2, 120)
  businessName!: string;

  @ApiProperty({ example: 'Everest Coffee Roasters Pvt Ltd' })
  @IsString()
  @Length(2, 200)
  legalBusinessName!: string;

  @ApiProperty({ enum: BusinessType, example: BusinessType.CORPORATION })
  @IsEnum(BusinessType)
  businessType!: BusinessType;

  @ApiProperty({ example: '5499' })
  @IsString()
  @Matches(/^\d{4}$/, { message: 'mcc must be 4 digits' })
  mcc!: string;

  @ApiPropertyOptional({ example: 'https://example.com' })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  website?: string;

  @ApiPropertyOptional({ example: '000000001' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{9}$/, { message: 'businessTaxId must be 9 digits' })
  businessTaxId?: string;

  @ApiProperty({ type: OwnerDto })
  @ValidateNested()
  @Type(() => OwnerDto)
  owner!: OwnerDto;

  @ApiProperty({ type: ProcessingDto })
  @ValidateNested()
  @Type(() => ProcessingDto)
  processing!: ProcessingDto;
}
