import { IsDateString, IsIn, IsOptional } from 'class-validator';

// `period` es la forma corta (30/60/90 días desde hoy); fromDate/toDate la
// larga, para un horizonte explícito - si vienen los dos, fromDate/toDate
// gana (ver CashflowProjectionService.getCashflowProjection). Los tres son
// opcionales: sin nada, default 30 días desde hoy.
export class CashflowProjectionQueryDto {
  @IsOptional()
  @IsIn(['30', '60', '90'])
  period?: string;

  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @IsOptional()
  @IsDateString()
  toDate?: string;
}
