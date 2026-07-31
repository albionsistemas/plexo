import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SupplierPaymentWithholdingDto } from './supplier-payment-withholding.dto.js';

/** Mirrors RecordReceiptDto (invoicing, the AR equivalent) field-for-field,
 * plus withholdings (Cuentas a Cobrar has no equivalent - a client never
 * withholds when THEY pay us in this app's current scope). `amount` keeps
 * meaning "cash/bank actually paid" unchanged - withholdings are added on
 * top when computing how much of the invoice this payment actually clears,
 * see PurchaseInvoiceService.recordPayment. */
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierPaymentWithholdingDto)
  withholdings?: SupplierPaymentWithholdingDto[];
}
