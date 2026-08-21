import { IsBoolean, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class SetMinimumStockDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @Min(0)
  minimumQuantity!: number;

  // Omitido: no toca el valor existente en un update (default false al
  // crear la fila). Ver InventoryReplenishmentSchedulerService.
  @IsOptional()
  @IsBoolean()
  autoReplenish?: boolean;
}
