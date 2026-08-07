import { UserRole } from '@plexo/database';
import { IsEnum } from 'class-validator';

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;
}
