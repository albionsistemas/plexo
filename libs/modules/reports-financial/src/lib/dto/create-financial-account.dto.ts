import { FinancialAccountProvider } from '@plexo/database';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateFinancialAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(FinancialAccountProvider)
  provider!: FinancialAccountProvider;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentBalance?: number;
}
