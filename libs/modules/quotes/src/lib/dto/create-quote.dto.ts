import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { QuoteLineDto } from './quote-line.dto.js';

export class CreateQuoteDto {
  @IsUUID()
  customerId!: string;

  @IsUUID()
  currencyId!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  // Ver CreateInvoiceDto.pricesIncludeTax - mismo criterio: si es true, el
  // unitPrice de cada línea se interpreta como precio final (con IVA) y se
  // desglosa a neto con la alícuota ya resuelta de esa línea.
  @IsOptional()
  @IsBoolean()
  pricesIncludeTax?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines!: QuoteLineDto[];
}
