import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class PurchaseOrderLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitCost!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
