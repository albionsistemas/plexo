import { JournalLineDirection } from '@plexo/database';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class JournalEntryLineDto {
  @IsUUID()
  accountId!: string;

  @IsEnum(JournalLineDirection)
  direction!: JournalLineDirection;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class PostJournalEntryDto {
  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines!: JournalEntryLineDto[];
}
