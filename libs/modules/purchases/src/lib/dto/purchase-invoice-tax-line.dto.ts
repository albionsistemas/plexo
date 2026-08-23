import { PurchaseInvoiceTaxLineType, WithholdingTaxType } from '@plexo/database';
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, Min, MinLength, ValidateIf } from 'class-validator';

/** One row of the IVA/Percepciones breakdown on the supplier's invoice -
 * free-text concept, not tied to TaxDefinition (that catalog is for our own
 * sales-side rates, not whatever a given supplier happens to charge). See
 * PurchaseInvoiceTaxLine in schema.prisma for why. netAmount/taxRate only
 * apply to IVA_CREDITO rows (a Percepción has no IVA rate of its own) -
 * required there, ignored otherwise. */
export class PurchaseInvoiceTaxLineDto {
  @IsEnum(PurchaseInvoiceTaxLineType)
  type!: PurchaseInvoiceTaxLineType;

  @IsString()
  @MinLength(1)
  concept!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @ValidateIf((o) => o.type === 'IVA_CREDITO')
  @IsNumber()
  @IsPositive()
  netAmount?: number;

  @ValidateIf((o) => o.type === 'IVA_CREDITO')
  @IsNumber()
  @Min(0)
  taxRate?: number;

  // Sub-clasificación de una fila PERCEPCION (IVA/IIBB/Ganancias) - sólo
  // para el export Libro de IVA Digital de Compras (ver
  // CitiExportService en @plexo/taxes), no afecta la contabilización.
  // Sin esto, la percepción cae en "otros impuestos nacionales" en ese
  // export en vez de perderse.
  @IsOptional()
  @IsEnum(WithholdingTaxType)
  taxType?: WithholdingTaxType;
}
