import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

/** Mirrors RecordReceiptDto (invoicing, the AR equivalent) field-for-field. */
export class RecordSupplierPaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  @MinLength(1)
  method!: string;

  @IsOptional()
  @IsUUID()
  financialAccountId?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
