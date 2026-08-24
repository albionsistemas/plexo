import { IsDateString, IsOptional } from 'class-validator';

/** Filtros opcionales de PayablesController.getSupplierStatement - mismo
 * patrón que VatBookQueryDto en @plexo/taxes. Sin from/to, el ledger
 * devuelve el historial completo (no hay "mes en curso" por defecto como en
 * un reporte - una cuenta corriente es un extracto acumulativo, no un
 * reporte periódico). pendingOnly llega como string crudo de query
 * ('true'/undefined), mismo criterio que includeInactive en
 * CompaniesController - no amerita su propio DTO boolean. */
export class StatementQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
