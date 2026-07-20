import { IsNumber, IsPositive, IsUUID } from 'class-validator';

export class RecordExchangeRateDto {
  @IsUUID()
  currencyId!: string;

  @IsNumber()
  @IsPositive()
  rate!: number;
}
