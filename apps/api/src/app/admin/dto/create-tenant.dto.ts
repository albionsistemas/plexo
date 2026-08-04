import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

// planKey queda como texto libre validado contra la tabla Plan en el
// service (Plan.findUniqueOrThrow), no como enum del DTO - mismo criterio
// que Company.taxCondition: es un catálogo que vive en la base, no algo
// que este DTO deba conocer de antemano.
export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsEmail()
  ownerEmail!: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsString()
  planKey!: string;
}
