import { IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

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
}
