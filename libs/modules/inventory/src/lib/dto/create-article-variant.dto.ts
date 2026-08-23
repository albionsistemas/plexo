import { IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateArticleVariantDto {
  @IsUUID()
  articleId!: string;

  @IsString()
  @MinLength(1)
  sku!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsNumber()
  @IsPositive()
  unitPrice!: number;

  // Costo inicial opcional, sólo para sembrar el primer registro de
  // PriceHistory de esta variante (no hay ninguna compra real todavía en
  // el momento de crear un artículo nuevo) - alimenta la sugerencia de
  // precio por % de remarca en el modal de creación. Nunca se actualiza
  // por acá después: el costo real sigue viniendo únicamente de
  // movimientos PURCHASE_IN/PRODUCTION_IN reales (ver recordMovement).
  @IsOptional()
  @IsNumber()
  @IsPositive()
  costPrice?: number;

  // Pares clave/valor libres ("Color": "Rojo", "Talle": "M") para el
  // creador de atributos/matriz de ArticleFormModal - class-validator sólo
  // chequea "es un objeto", el shape clave/valor de tipo string se valida
  // en InventoryService.createArticleVariant (ver ahí el porqué).
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;
}
