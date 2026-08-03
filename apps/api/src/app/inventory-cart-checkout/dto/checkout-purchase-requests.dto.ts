import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class PurchaseRequestGroupLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedUnitCost?: number;
}

/** One QuoteRequest ("Pedido de Cotización") worth of lines for a single
 * supplier - see CheckoutPurchaseRequestsDto for why the cart's items get
 * split into one of these per supplier instead of one shared document. */
export class PurchaseRequestGroupDto {
  @IsUUID()
  supplierId!: string;

  @IsUUID()
  currencyId!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestGroupLineDto)
  lines!: PurchaseRequestGroupLineDto[];
}

/**
 * "Pedido de costos" checkout from the cart: the user assigns each cart
 * line to a supplier (possibly different suppliers for different lines,
 * decision with the user 2026-08-03 - "repartir ítems por proveedor", not
 * "the same list to every supplier"), one independent QuoteRequest gets
 * created per supplier group. Deliberately NOT tagged with a shared
 * rfqGroupId like QuoteRequestService.createGroup() does - that field's
 * compareGroup()/selectWinner() assume every sibling has the same lines and
 * selectWinner() cancels the losing siblings, which would be actively wrong
 * here (these documents have different lines on purpose, cancelling one
 * because another "won" would silently lose real supplier requests).
 */
export class CheckoutPurchaseRequestsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestGroupDto)
  groups!: PurchaseRequestGroupDto[];
}
