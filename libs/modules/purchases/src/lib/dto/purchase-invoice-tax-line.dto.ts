import { PurchaseInvoiceTaxLineType } from '@plexo/database';
import { IsEnum, IsNumber, IsPositive, IsString, Min, MinLength, ValidateIf } from 'class-validator';

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
}
