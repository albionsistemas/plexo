import { IsUUID } from 'class-validator';

export class SelectQuoteRequestWinnerDto {
  @IsUUID()
  winningQuoteRequestId!: string;
}
