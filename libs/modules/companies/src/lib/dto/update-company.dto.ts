import { CompanyRoleType } from '@plexo/database';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

/** When roles is provided, it REPLACES the company's full role set
 * (delete + recreate) rather than adding to it - simplest correct
 * semantics, avoids ambiguity about whether an omitted role should be
 * removed or just not mentioned. */
export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  @IsOptional()
  @IsString()
  pointOfSaleNumber?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(CompanyRoleType, { each: true })
  roles?: CompanyRoleType[];
}
