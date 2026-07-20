import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, MinLength } from 'class-validator';

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
}
