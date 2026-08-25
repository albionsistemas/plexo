import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SupplierPaymentWithholdingDto } from './supplier-payment-withholding.dto.js';

/** Detalle del cheque propio diferido cuando se paga emitiendo uno nuevo
 * (en vez de endosar uno de cartera, ver RecordSupplierPaymentDto.
 * endorseCheckId) - campos propios, no un DTO de @plexo/treasury (mismo
 * criterio que ReceiptCheckDto en @plexo/invoicing, un lib module nunca
 * importa el de otro). */
export class OwnCheckDto {
  @IsString()
  @MinLength(1)
  number!: string;

  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsOptional()
  @IsIn(['PHYSICAL', 'ECHEQ'])
  format?: 'PHYSICAL' | 'ECHEQ';

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;

  // De qué cuenta propia va a salir cuando se acredite (ver
  // CheckService.markCleared) - opcional acá, se puede cargar/corregir
  // después desde Cartera de Cheques antes de marcarlo acreditado.
  @IsOptional()
  @IsUUID()
  financialAccountId?: string;
}

/** Mirrors RecordReceiptDto (invoicing, the AR equivalent) field-for-field,
 * plus withholdings (Cuentas a Cobrar has no equivalent - a client never
 * withholds when THEY pay us in this app's current scope). `amount` keeps
 * meaning "cash/bank actually paid" unchanged - withholdings are added on
 * top when computing how much of the invoice this payment actually clears,
 * see PurchaseInvoiceService.recordPayment.
 *
 * `endorseCheckId`/`ownCheck` son mutuamente excluyentes (a lo sumo un
 * cheque por pago, mismo criterio que Check.supplierPaymentId es @unique)
 * - apps/api's PurchaseInvoicesService es quien lo valida y compone con
 * CheckService, @plexo/purchases no importa @plexo/treasury. */
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

  @IsOptional()
  @IsUUID()
  endorseCheckId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OwnCheckDto)
  ownCheck?: OwnCheckDto;
}
