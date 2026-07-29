import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class SupplierReturnLineDto {
  @IsUUID()
  goodsReceiptLineId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;
}
