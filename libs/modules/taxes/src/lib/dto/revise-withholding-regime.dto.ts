import { ArgentineJurisdiction } from '@plexo/database';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

/**
 * Versions a withholding regime forward - never edits rate/jurisdiction/
 * minTaxableAmount on an existing row (the DB blocks that, see
 * withholding_regime_version_lock). Closes the current active row's
 * validTo at effectiveFrom and creates a new one, same shape as
 * ReviseTaxDefinitionDto.
 */
export class ReviseWithholdingRegimeDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsEnum(ArgentineJurisdiction)
  jurisdiction?: ArgentineJurisdiction;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minTaxableAmount?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
