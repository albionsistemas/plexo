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
import { PurchaseInvoiceTaxLineDto } from './purchase-invoice-tax-line.dto.js';

/**
 * Factura de Compra - the supplier's own fiscal document, always tied to a
 * PurchaseOrder (see PurchaseInvoiceService). Header-level on purpose, no
 * article-level lines: the user is transcribing what's already priced and
 * taxed on a piece of paper, not recalculating per-article amounts again
 * (that detail already lives on PurchaseOrderLine).
 */
export class CreatePurchaseInvoiceDto {
  @IsUUID()
  purchaseOrderId!: string;

  // The supplier's own invoice number - free text, not a Plexo-generated
  // series (see GoodsReceipt.supplierDocNumber for the same convention).
  @IsString()
  @MinLength(1)
  supplierInvoiceNumber!: string;

  @IsDateString()
  supplierInvoiceDate!: string;

  // Optional - see PurchaseInvoice.dueDate. Only invoices with one set show
  // up bucketed in the Cuentas a Pagar aging report.
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  // Net amount, pre-tax, as written on the supplier's invoice.
  @IsNumber()
  @IsPositive()
  subtotal!: number;

  // Remitos (GoodsReceipt) of this PurchaseOrder that this invoice clears
  // from the GRNI bridge - v1 is whole-receipt only (see
  // PurchaseInvoiceReceipt's @@unique). Optional/empty for a pure-services
  // order (Article.isService never gets a remito).
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  goodsReceiptIds?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceTaxLineDto)
  taxLines?: PurchaseInvoiceTaxLineDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
