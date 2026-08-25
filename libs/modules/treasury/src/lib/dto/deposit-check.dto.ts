import { IsUUID } from 'class-validator';

export class DepositCheckDto {
  @IsUUID()
  financialAccountId!: string;
}
