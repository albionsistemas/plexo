import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateArticleDto {
  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  // null clears it (article has no preferred supplier); omitted leaves it
  // untouched. IsOptional treats both undefined and null as "skip
  // validation", so an explicit null still reaches the service layer.
  @IsOptional()
  @IsUUID()
  preferredSupplierId?: string | null;

  // null vuelve a "sin override" (usa TenantSettings.defaultMarkupPercent);
  // omitido deja el valor guardado sin tocar - misma convención que
  // preferredSupplierId de arriba.
  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercent?: number | null;

  // "Dato extra" - null lo vacía, omitido no lo toca (misma convención que
  // preferredSupplierId/markupPercent de arriba).
  @IsOptional()
  @IsString()
  description?: string | null;
}
