import { IsDateString, IsOptional } from 'class-validator';

export class VatBookQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
