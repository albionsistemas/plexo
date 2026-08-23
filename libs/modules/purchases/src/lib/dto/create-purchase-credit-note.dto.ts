import { DocumentLetter } from '@plexo/database';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PurchaseInvoiceTaxLineDto } from './purchase-invoice-tax-line.dto.js';

/**
 * Nota de Crédito de Compra - a credit note the supplier issues against an
 * already-recorded PurchaseInvoice (discount, pricing correction, billing
 * error), NOT a physical return of goods (that's CreateSupplierReturnDto).
 * Header-level, same reasoning as CreatePurchaseInvoiceDto: the user
 * transcribes what's already on the supplier's own document, no
 * article-level lines. currencyId isn't a field here - it's always the
 * credited PurchaseInvoice's own currency, same convention as
 * CreatePurchaseInvoiceDto deriving currencyId from its PurchaseOrder.
 */
export class CreatePurchaseCreditNoteDto {
  @IsUUID()
  purchaseInvoiceId!: string;

  // The supplier's own credit note number - free text, not a Plexo-generated
  // series (same convention as CreatePurchaseInvoiceDto.supplierInvoiceNumber).
  @IsString()
  @MinLength(1)
  supplierCreditNoteNumber!: string;

  @IsDateString()
  supplierCreditNoteDate!: string;

  // Ver el mismo comentario en CreatePurchaseInvoiceDto - aditivo, sólo
  // para el export Libro de IVA Digital.
  @IsOptional()
  @IsEnum(DocumentLetter)
  documentLetter?: DocumentLetter;

  @IsOptional()
  @IsString()
  pointOfSale?: string;

  @IsOptional()
  @IsString()
  number?: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  // Net amount, pre-tax, as written on the supplier's credit note.
  @IsNumber()
  @IsPositive()
  subtotal!: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceTaxLineDto)
  taxLines?: PurchaseInvoiceTaxLineDto[];

  // Traceability only, when this credit note happens to correspond to a
  // physical devolución already logged - see PurchaseCreditNote.supplierReturnId.
  @IsOptional()
  @IsUUID()
  supplierReturnId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
