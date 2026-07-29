import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { GoodsReceiptLineDto } from './goods-receipt-line.dto.js';

/** A remito against an already-SENT PurchaseOrder - see GoodsReceiptService.
 * Quantity-only per line on purpose, no cost field: the price already lives
 * on PurchaseOrderLine.unitCost. */
export class CreateGoodsReceiptDto {
  @IsUUID()
  purchaseOrderId!: string;

  @IsUUID()
  warehouseId!: string;

  // The supplier's own remito/comprobante number - free text, not a
  // Plexo-generated series (see GoodsReceipt.supplierDocNumber).
  @IsOptional()
  @IsString()
  supplierDocNumber?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}
