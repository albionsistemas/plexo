import { IsNumber, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class RejectCheckDto {
  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  feeAmount?: number;
}
