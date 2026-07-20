import { IsNumber, IsUUID, Min } from 'class-validator';

export class SetMinimumStockDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @Min(0)
  minimumQuantity!: number;
}
