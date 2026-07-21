import { DocumentLetter } from '@plexo/database';
import { CreateInvoiceLineDto } from '@plexo/invoicing';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateSaleDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsEnum(DocumentLetter)
  documentLetter!: DocumentLetter;

  // A Company with the BRANCH role - resolves to its pointOfSaleNumber
  // internally (see SalesService), rather than the caller typing the AFIP
  // punto de venta string by hand.
  @IsUUID()
  branchId!: string;

  @IsUUID()
  currencyId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  globalDiscountPercent?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineDto)
  lines!: CreateInvoiceLineDto[];
}
