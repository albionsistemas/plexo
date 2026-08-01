import { IsOptional, IsString, MinLength } from 'class-validator';

export class MarkSentWhatsappDto {
  @IsString()
  @MinLength(1)
  phone!: string;

  @IsOptional()
  @IsString()
  contactName?: string;
}
