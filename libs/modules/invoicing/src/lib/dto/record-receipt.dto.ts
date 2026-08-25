import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** Detalle del cheque de tercero cuando se cobra con `method: 'CHECK'` -
 * campos propios, no un DTO importado de @plexo/treasury (un lib module
 * nunca importa el de otro, ni siquiera sólo el tipo - mismo criterio ya
 * aplicado en QuoteLine/PurchaseOrderLine para no acoplar módulos por un
 * shape chico). apps/api's SalesService es quien arma el
 * RegisterThirdPartyCheckData real que CheckService espera a partir de
 * esto. */
export class ReceiptCheckDto {
  @IsString()
  @MinLength(1)
  number!: string;

  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsOptional()
  @IsString()
  drawerCuit?: string;

  @IsOptional()
  @IsIn(['PHYSICAL', 'ECHEQ'])
  format?: 'PHYSICAL' | 'ECHEQ';

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;
}

export class RecordReceiptDto {
  @IsUUID()
  invoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  method!: string;

  @IsOptional()
  @IsUUID()
  financialAccountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReceiptCheckDto)
  check?: ReceiptCheckDto;
}
