import { UserRole } from '@plexo/database';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
