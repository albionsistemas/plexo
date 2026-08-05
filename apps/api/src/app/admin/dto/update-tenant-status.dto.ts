import { IsIn } from 'class-validator';
import type { TenantStatus } from '@plexo/database';

export class UpdateTenantStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: TenantStatus;
}
