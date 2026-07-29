import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { SupplierReturnLineDto } from './supplier-return-line.dto.js';

/** Goods sent back to the supplier out of a specific remito (e.g. a
 * defective unit) - see SupplierReturnService. Always scoped to one
 * GoodsReceipt, no warehouse field: it's implied by that receipt's own
 * warehouse. Quantity-only per line, same reasoning as CreateGoodsReceiptDto
 * (no price field - the cost is read back from the ledger's average). */
export class CreateSupplierReturnDto {
  @IsUUID()
  goodsReceiptId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnLineDto)
  lines!: SupplierReturnLineDto[];
}
