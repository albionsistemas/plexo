import { IsDateString, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class RecordFinancialTransactionDto {
  @IsUUID()
  financialAccountId!: string;

  // Signed: positive for an inflow, negative for an outflow. Zero is
  // rejected in the service (not a validator here - "not zero" isn't one
  // of class-validator's built-ins without a custom decorator).
  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;
}
