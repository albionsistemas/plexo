import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReversingEntryDto {
  @IsUUID()
  originalEntryId!: string;

  @IsOptional()
  @IsString()
  description?: string;
}
