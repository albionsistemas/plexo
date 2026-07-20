import { MovementType } from '@plexo/database';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordStockMovementDto {
  @IsUUID()
  warehouseId!: string;

  @IsUUID()
  articleVariantId!: string;

  @IsEnum(MovementType)
  type!: MovementType;

  // Positive magnitude for every type except ADJUSTMENT (where this is
  // already the signed correction) - enforced in InventoryService, not
  // here, since the rule depends on `type`.
  @IsNumber()
  quantity!: number;

  @IsOptional()
  @IsString()
  sourceType?: string;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;
}
