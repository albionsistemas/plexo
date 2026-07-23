import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto.js';

export interface TenantSettingsView {
  arReminderIntervalDays: number | null;
}

@Injectable()
export class TenantSettingsService {
  /** No row yet (tenant never visited Preferencias) reads as "everything
   * off" - matches the behavior that existed before this feature, so a
   * tenant that never opens this screen sees nothing change. The row is
   * only created lazily, on the first PATCH. */
  async getSettings(): Promise<TenantSettingsView> {
    const row = await getTenantDb().tenantSettings.findUnique({
      where: { tenantId: getTenantId() },
    });
    return { arReminderIntervalDays: row?.arReminderIntervalDays ?? null };
  }

  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const row = await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, arReminderIntervalDays: dto.arReminderIntervalDays ?? null },
      update: { arReminderIntervalDays: dto.arReminderIntervalDays },
    });
    return { arReminderIntervalDays: row.arReminderIntervalDays };
  }
}
