import { tenantContextStorage } from '@plexo/database';
import type { ResendDomainsClient } from './resend-domain-client.provider.js';
import { TenantSettingsService } from './tenant-settings.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeDomainsClient(overrides: Partial<ResendDomainsClient> = {}): ResendDomainsClient {
  return {
    create: jest.fn(),
    get: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    verify: jest.fn(),
    ...overrides,
  } as unknown as ResendDomainsClient;
}

describe('TenantSettingsService.getSettings', () => {
  it('reads defaults when no row exists yet', async () => {
    const db = { tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new TenantSettingsService(null);

    const result = await runInTenant(db, () => service.getSettings());

    expect(db.tenantSettings.findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    expect(result).toEqual({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
      reminderCcEmail: null,
    });
  });

  it('reads back stored values', async () => {
    const db = {
      tenantSettings: {
        findUnique: jest.fn().mockResolvedValue({
          arReminderIntervalDays: 7,
          emailSenderMode: 'CUSTOM_DOMAIN',
          emailFromName: 'Facturación Acme',
          emailFromLocalPart: 'facturas',
          emailCustomDomain: 'acme.com',
          domainStatus: 'verified',
          reminderTone: 'FIRM',
          reminderCcEmail: 'cobranzas@acme.com',
        }),
      },
    };
    const service = new TenantSettingsService(null);

    const result = await runInTenant(db, () => service.getSettings());

    expect(result).toEqual({
      arReminderIntervalDays: 7,
      emailSenderMode: 'CUSTOM_DOMAIN',
      emailFromName: 'Facturación Acme',
      emailFromLocalPart: 'facturas',
      emailCustomDomain: 'acme.com',
      domainStatus: 'verified',
      reminderTone: 'FIRM',
      reminderCcEmail: 'cobranzas@acme.com',
    });
  });
});

describe('TenantSettingsService.updateSettings', () => {
  it('upserts the row for the current tenant, creating it on first write', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: 5,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
    });
    const db = { tenantSettings: { upsert } };
    const service = new TenantSettingsService(null);

    const result = await runInTenant(db, () => service.updateSettings({ arReminderIntervalDays: 5 }));

    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: {
        tenantId: 'tenant-1',
        arReminderIntervalDays: 5,
        emailSenderMode: undefined,
        emailFromName: undefined,
        emailFromLocalPart: undefined,
        reminderTone: undefined,
        reminderCcEmail: null,
      },
      update: {
        arReminderIntervalDays: 5,
        emailSenderMode: undefined,
        emailFromName: undefined,
        emailFromLocalPart: undefined,
        reminderTone: undefined,
        reminderCcEmail: undefined,
      },
    });
    expect(result.arReminderIntervalDays).toBe(5);
  });

  it('turns recurring reminders off by writing null', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
    });
    const db = { tenantSettings: { upsert } };
    const service = new TenantSettingsService(null);

    await runInTenant(db, () => service.updateSettings({ arReminderIntervalDays: null }));

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'tenant-1' },
        create: expect.objectContaining({ arReminderIntervalDays: null }),
        update: expect.objectContaining({ arReminderIntervalDays: null }),
      }),
    );
  });

  it('saves the custom sender identity and reminder tone', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'CUSTOM_DOMAIN',
      emailFromName: 'Facturación Acme',
      emailFromLocalPart: 'facturas',
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'FRIENDLY',
    });
    const db = { tenantSettings: { upsert } };
    const service = new TenantSettingsService(null);

    await runInTenant(db, () =>
      service.updateSettings({
        emailSenderMode: 'CUSTOM_DOMAIN',
        emailFromName: 'Facturación Acme',
        emailFromLocalPart: 'facturas',
        reminderTone: 'FRIENDLY',
      }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          emailSenderMode: 'CUSTOM_DOMAIN',
          emailFromName: 'Facturación Acme',
          emailFromLocalPart: 'facturas',
          reminderTone: 'FRIENDLY',
        }),
        update: expect.objectContaining({
          emailSenderMode: 'CUSTOM_DOMAIN',
          emailFromName: 'Facturación Acme',
          emailFromLocalPart: 'facturas',
          reminderTone: 'FRIENDLY',
        }),
      }),
    );
  });

  it('saves reminderCcEmail, and clears it by writing null', async () => {
    const upsert = jest.fn().mockResolvedValue({
      arReminderIntervalDays: null,
      emailSenderMode: 'SHARED',
      emailFromName: null,
      emailFromLocalPart: null,
      emailCustomDomain: null,
      domainStatus: null,
      reminderTone: 'NEUTRAL',
      reminderCcEmail: 'cobranzas@acme.com',
    });
    const db = { tenantSettings: { upsert } };
    const service = new TenantSettingsService(null);

    const result = await runInTenant(db, () =>
      service.updateSettings({ reminderCcEmail: 'cobranzas@acme.com' }),
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reminderCcEmail: 'cobranzas@acme.com' }),
        update: expect.objectContaining({ reminderCcEmail: 'cobranzas@acme.com' }),
      }),
    );
    expect(result.reminderCcEmail).toBe('cobranzas@acme.com');

    await runInTenant(db, () => service.updateSettings({ reminderCcEmail: null }));

    expect(upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ reminderCcEmail: null }),
        update: expect.objectContaining({ reminderCcEmail: null }),
      }),
    );
  });
});

describe('TenantSettingsService.registerCustomDomain', () => {
  it('throws when Resend is not configured in this environment', async () => {
    const service = new TenantSettingsService(null);
    const db = { tenantSettings: { findUnique: jest.fn() } };

    await expect(runInTenant(db, () => service.registerCustomDomain('acme.com'))).rejects.toThrow(
      /no está configurado/,
    );
  });

  it('creates a new Resend domain and persists its id/status', async () => {
    const create = jest.fn().mockResolvedValue({
      data: { id: 'dom_1', status: 'not_started', records: [{ record: 'SPF' }] },
      error: null,
    });
    const domains = makeDomainsClient({ create });
    const upsert = jest.fn().mockResolvedValue({});
    const db = {
      tenantSettings: { findUnique: jest.fn().mockResolvedValue(null), upsert },
    };
    const service = new TenantSettingsService(domains);

    const result = await runInTenant(db, () => service.registerCustomDomain('acme.com'));

    expect(create).toHaveBeenCalledWith({ name: 'acme.com' });
    expect(upsert).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
      create: {
        tenantId: 'tenant-1',
        emailCustomDomain: 'acme.com',
        resendDomainId: 'dom_1',
        domainStatus: 'not_started',
      },
      update: { emailCustomDomain: 'acme.com', resendDomainId: 'dom_1', domainStatus: 'not_started' },
    });
    expect(result).toEqual({ status: 'not_started', records: [{ record: 'SPF' }] });
  });

  it('re-fetches instead of re-creating when the same domain is already registered', async () => {
    const create = jest.fn();
    const get = jest.fn().mockResolvedValue({
      data: { id: 'dom_1', status: 'pending', records: [] },
      error: null,
    });
    const domains = makeDomainsClient({ create, get });
    const db = {
      tenantSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ resendDomainId: 'dom_1', emailCustomDomain: 'acme.com' }),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    const service = new TenantSettingsService(domains);

    await runInTenant(db, () => service.registerCustomDomain('acme.com'));

    expect(create).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith('dom_1');
  });

  it('surfaces a Resend error as a BadRequestException', async () => {
    const create = jest.fn().mockResolvedValue({ data: null, error: { message: 'Domain taken' } });
    const domains = makeDomainsClient({ create });
    const db = { tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new TenantSettingsService(domains);

    await expect(runInTenant(db, () => service.registerCustomDomain('acme.com'))).rejects.toThrow(
      'Domain taken',
    );
  });
});

describe('TenantSettingsService.refreshDomainStatus', () => {
  it('throws when no domain was registered yet', async () => {
    const domains = makeDomainsClient();
    const db = { tenantSettings: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new TenantSettingsService(domains);

    await expect(runInTenant(db, () => service.refreshDomainStatus())).rejects.toThrow(
      /Todavía no registraste/,
    );
  });

  it('verifies then re-fetches, persisting the latest status', async () => {
    const verify = jest.fn().mockResolvedValue({ data: { id: 'dom_1' }, error: null });
    const get = jest.fn().mockResolvedValue({
      data: { id: 'dom_1', status: 'verified', records: [{ record: 'DKIM' }] },
      error: null,
    });
    const domains = makeDomainsClient({ verify, get });
    const upsert = jest.fn().mockResolvedValue({});
    const db = {
      tenantSettings: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ resendDomainId: 'dom_1', emailCustomDomain: 'acme.com' }),
        upsert,
      },
    };
    const service = new TenantSettingsService(domains);

    const result = await runInTenant(db, () => service.refreshDomainStatus());

    expect(verify).toHaveBeenCalledWith('dom_1');
    expect(get).toHaveBeenCalledWith('dom_1');
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({ domainStatus: 'verified' }),
      }),
    );
    expect(result).toEqual({ status: 'verified', records: [{ record: 'DKIM' }] });
  });
});
