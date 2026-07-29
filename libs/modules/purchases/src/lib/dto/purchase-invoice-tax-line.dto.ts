import { PurchaseInvoiceTaxLineType } from '@plexo/database';
import { IsEnum, IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

/** One row of the IVA/Percepciones breakdown on the supplier's invoice -
 * free-text concept, not tied to TaxDefinition (that catalog is for our own
 * sales-side rates, not whatever a given supplier happens to charge). See
 * PurchaseInvoiceTaxLine in schema.prisma for why. */
export class PurchaseInvoiceTaxLineDto {
  @IsEnum(PurchaseInvoiceTaxLineType)
  type!: PurchaseInvoiceTaxLineType;

  @IsString()
  @MinLength(1)
  concept!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}
