import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
