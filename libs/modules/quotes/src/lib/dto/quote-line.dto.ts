import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class QuoteLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
