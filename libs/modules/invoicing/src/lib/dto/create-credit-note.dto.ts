import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateCreditNoteLineDto {
  @IsUUID()
  invoiceLineId!: string;

  // Quantity being credited from this line - never the signed correction
  // ADJUSTMENT movements use, always a positive magnitude.
  @IsNumber()
  @IsPositive()
  quantity!: number;
}

/**
 * A credit note always targets specific invoice lines and quantities -
 * crediting every line's full quantity is what used to be called "full
 * reversal" (the only thing v1 supported), same code path now, no
 * separate DTO/service branch. InvoicingService.createCreditNote enforces
 * that the sum of credited quantity for a line, across every credit note
 * ever issued against that invoice, never exceeds the line's original
 * quantity.
 */
export class CreateCreditNoteDto {
  @IsUUID()
  invoiceId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateCreditNoteLineDto)
  lines!: CreateCreditNoteLineDto[];
}
