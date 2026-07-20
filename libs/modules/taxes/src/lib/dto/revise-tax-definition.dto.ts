import { IsDateString, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Versions a tax definition forward - never edits rate/fixedAmount on an
 * existing row (the DB blocks that anyway, see tax_definition_version_lock).
 * Closes the current active row's validTo at effectiveFrom and creates a
 * new one, so invoices already issued keep whatever was true when they
 * were computed.
 */
export class ReviseTaxDefinitionDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  fixedAmount?: number;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
