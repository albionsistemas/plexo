import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

// Nunca incluye `key` - una vez creado, el slug que TenantSubscription.planId
// referencia no se renombra (ver createPlan.dto.ts para el alta).
export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceMonthly?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxUsers?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxClients?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxMonthlyInvoices?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  debitDiscountPercent?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
