import { tenantContextStorage } from '@plexo/database';
import { TenantSettingsService } from './tenant-settings.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('TenantSettingsService.getSettings', () => {
  it('reads arReminderIntervalDays as null when no row exists yet', async () => {
    const db = { tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new TenantSettingsService();

    const result = await runInTenant(db, () => service.getSettings());

    expect(db.tenantSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(result).toEqual({ arReminderIntervalDays: null });
  });

  it('reads back a stored value', async () => {
    const db = {
      tenantSettings: { findUnique: jest.fn().mockResolvedValue({ arReminderIntervalDays: 7 }) },
    };
    const service = new TenantSettingsService();

    const result = await runInTenant(db, () => service.getSettings());

    expect(result).toEqual({ arReminderIntervalDays: 7 });
  });
});

describe('TenantSettingsService.updateSettings', () => {
  it('upserts the row for the current tenant, creating it on first write', async () => {
    const upsert = jest.fn().mockResolvedValue({ arReminderIntervalDays: 5 });
    const db = { tenantSettings: { upsert } };
    const service = new TenantSettingsService();

    const result = await runInTenant(db, () => service.updateSettings({ arReminderIntervalDays: 5 }));

    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: { tenantId: 'tenant-1', arReminderIntervalDays: 5 },
      update: { arReminderIntervalDays: 5 },
    });
    expect(result).toEqual({ arReminderIntervalDays: 5 });
  });

  it('turns recurring reminders off by writing null', async () => {
    const upsert = jest.fn().mockResolvedValue({ arReminderIntervalDays: null });
    const db = { tenantSettings: { upsert } };
    const service = new TenantSettingsService();

    await runInTenant(db, () => service.updateSettings({ arReminderIntervalDays: null }));

    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: { tenantId: 'tenant-1', arReminderIntervalDays: null },
      update: { arReminderIntervalDays: null },
    });
  });
});
