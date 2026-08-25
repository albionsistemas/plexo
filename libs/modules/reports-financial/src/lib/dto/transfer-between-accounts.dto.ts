import { IsDateString, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

// fromFinancialAccountId !== toFinancialAccountId se valida en el service
// (BadRequestException), no acá - class-validator no tiene un decorator
// simple para comparar dos campos del mismo objeto, mismo criterio que
// "Payment amount exceeds balance due" (InvoicingService.recordReceipt) ya
// resuelve en el service, no en el DTO.
export class TransferBetweenAccountsDto {
  @IsUUID()
  fromFinancialAccountId!: string;

  @IsUUID()
  toFinancialAccountId!: string;

  // A diferencia de RecordFinancialTransactionDto.amount, acá siempre es
  // positivo - el signo de cada pata (débito en origen, crédito en
  // destino) lo decide el service, no quien llama.
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
