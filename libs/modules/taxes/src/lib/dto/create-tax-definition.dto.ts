import { TaxCalculationType } from '@plexo/database';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTaxDefinitionDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(TaxCalculationType)
  calculationType?: TaxCalculationType;

  @IsOptional()
  @IsNumber()
  rate?: number;

  @IsOptional()
  @IsNumber()
  fixedAmount?: number;

  @IsOptional()
  @IsString()
  formula?: string;

  @IsOptional()
  @IsBoolean()
  managedByAccountant?: boolean;
}
