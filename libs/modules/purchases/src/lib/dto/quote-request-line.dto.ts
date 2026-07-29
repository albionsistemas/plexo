import { IsNumber, IsOptional, IsPositive, IsString, IsUUID, Min } from 'class-validator';

export class QuoteRequestLineDto {
  @IsUUID()
  articleVariantId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedUnitCost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
