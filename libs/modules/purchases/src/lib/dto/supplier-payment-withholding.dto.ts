import { ArgentineJurisdiction, WithholdingTaxType } from '@plexo/database';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

/** One retención line to attach to a SupplierPayment - see
 * PurchaseInvoiceService.recordPayment. Mirrors PurchaseInvoiceTaxLine's
 * free-text trust level: amount is whatever the user typed/confirmed
 * (usually pre-filled by the frontend from the chosen regime's rate, but
 * always editable), not recomputed server-side. */
export class SupplierPaymentWithholdingDto {
  @IsOptional()
  @IsUUID()
  regimeId?: string;

  @IsEnum(WithholdingTaxType)
  taxType!: WithholdingTaxType;

  @IsOptional()
  @IsEnum(ArgentineJurisdiction)
  jurisdiction?: ArgentineJurisdiction;

  @IsString()
  @MinLength(1)
  concept!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  certificateNumber?: string;
}
