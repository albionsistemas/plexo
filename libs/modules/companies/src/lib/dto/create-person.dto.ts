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

  // URL only - same convention as User.avatarUrl, no file storage infra.
  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  jobTitle?: string;
}
