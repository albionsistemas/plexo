import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

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
}
