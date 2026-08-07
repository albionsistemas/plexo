import { UserRole } from '@plexo/database';
import { IsEmail, IsEnum } from 'class-validator';

export class SendInvitationDto {
  @IsEmail()
  email!: string;

  @IsEnum(UserRole)
  role!: UserRole;
}
