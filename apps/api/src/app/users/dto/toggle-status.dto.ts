import { UserStatus } from '@plexo/database';
import { IsEnum } from 'class-validator';

export class ToggleStatusDto {
  @IsEnum(UserStatus)
  status!: UserStatus;
}
