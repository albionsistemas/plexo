import { IsDateString, IsOptional } from 'class-validator';

/** Filtros opcionales de ReceivablesController.getCustomerStatement - ver
 * el mismo comentario en @plexo/payables' StatementQueryDto. */
export class StatementQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
