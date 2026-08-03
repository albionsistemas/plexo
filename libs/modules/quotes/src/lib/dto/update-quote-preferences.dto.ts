import { PdfStyle } from '@plexo/database';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateQuotePreferencesDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'quotePrefix must be letters/numbers only' })
  quotePrefix?: string;

  @IsOptional()
  @IsEnum(PdfStyle)
  quotePdfStyle?: PdfStyle;
}
