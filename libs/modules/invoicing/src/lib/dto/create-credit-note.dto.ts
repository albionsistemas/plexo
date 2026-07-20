import { IsString, IsUUID, MinLength } from 'class-validator';

/**
 * v1: full reversal only (reason + the invoice it corrects - amounts are
 * copied from the invoice as-is). Partial credit notes (returning some
 * lines/quantities but not others) need their own line-item breakdown and
 * are deliberately out of scope here; add a CreditNoteLine model + DTO
 * lines when that's actually needed instead of guessing the shape now.
 */
export class CreateCreditNoteDto {
  @IsUUID()
  invoiceId!: string;

  @IsString()
  @MinLength(1)
  reason!: string;
}
