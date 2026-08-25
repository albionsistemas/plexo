import { IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { CheckStatus } from '@plexo/database';

export class ListChecksQueryDto {
  @IsOptional()
  @IsEnum(CheckStatus)
  status?: CheckStatus;

  @IsOptional()
  @IsIn(['THIRD_PARTY', 'OWN'])
  kind?: 'THIRD_PARTY' | 'OWN';

  @IsOptional()
  @IsString()
  bankName?: string;

  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @IsOptional()
  @IsDateString()
  dueTo?: string;
}
