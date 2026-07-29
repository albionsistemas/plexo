import { PdfStyle } from '@plexo/database';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdatePurchasePreferencesDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'quoteRequestPrefix must be letters/numbers only' })
  quoteRequestPrefix?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'purchaseOrderPrefix must be letters/numbers only' })
  purchaseOrderPrefix?: string;

  @IsOptional()
  @IsEnum(PdfStyle)
  purchaseDocumentPdfStyle?: PdfStyle;
}
