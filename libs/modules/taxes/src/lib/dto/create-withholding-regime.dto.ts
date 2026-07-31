import { ArgentineJurisdiction, WithholdingTaxType } from '@plexo/database';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateWithholdingRegimeDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(WithholdingTaxType)
  taxType!: WithholdingTaxType;

  // Only meaningful when taxType = GROSS_INCOME - not enforced at the DTO
  // level (same trust level as the rest of this catalog, see the schema
  // comment on WithholdingRegime.jurisdiction).
  @IsOptional()
  @IsEnum(ArgentineJurisdiction)
  jurisdiction?: ArgentineJurisdiction;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minTaxableAmount?: number;

  @IsOptional()
  @IsBoolean()
  managedByAccountant?: boolean;
}
