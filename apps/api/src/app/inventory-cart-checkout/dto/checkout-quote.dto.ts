import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class CheckoutQuoteLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

/** "Proponer venta" checkout from the cart: the whole list (or whatever
 * subset the user picked) becomes one Quote to one customer, with the
 * price editable per line (default is ArticleVariant.unitPrice, resolved
 * client-side when opening the checkout modal). */
export class CheckoutQuoteDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutQuoteLineDto)
  lines!: CheckoutQuoteLineDto[];
}
