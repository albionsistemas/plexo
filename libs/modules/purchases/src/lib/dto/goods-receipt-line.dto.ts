import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class GoodsReceiptLineDto {
  @IsUUID()
  purchaseOrderLineId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;
}
