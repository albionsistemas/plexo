import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreatePersonDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  // Either a pasted URL, or set later via PersonAvatarService's upload
  // endpoint (POST people/:id/avatar) - both write to this same column.
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}
