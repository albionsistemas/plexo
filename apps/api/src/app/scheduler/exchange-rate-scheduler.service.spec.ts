import { BadRequestException } from '@nestjs/common';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { InvoicingService } from '@plexo/invoicing';
import type { BnaExchangeRatePort } from '@plexo/invoicing';
import type { PrismaService } from '@plexo/database';
import { ExchangeRateSchedulerService } from './exchange-rate-scheduler.service.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn((_prisma: unknown, _tenantId: string, fn: () => unknown) => fn()),
  getTenantDb: jest.fn(),
}));

const { withTenantContext, getTenantDb } = jest.requireMock('@plexo/database') as {
  withTenantContext: jest.Mock;
  getTenantDb: jest.Mock;
};

function makeBnaExchangeRate(overrides: Partial<BnaExchangeRatePort> = {}): BnaExchangeRatePort {
  return {
    getOfficialUsdRate: jest
      .fn()
      .mockResolvedValue({ buy: 1000, sell: 1050, asOf: new Date('2026-01-01') }),
    ...overrides,
  };
}

function makeSchedulerRegistry(): SchedulerRegistry {
  return {
    addCronJob: jest.fn(),
    getCronJob: jest.fn().mockReturnValue({ setTime: jest.fn() }),
  } as unknown as SchedulerRegistry;
}

describe('ExchangeRateSchedulerService.getSettings', () => {
  beforeEach(() => {
    withTenantContext.mockClear();
    getTenantDb.mockReset();
  });

  it('returns the existing singleton row when present', async () => {
    const prisma = {
      platformSettings: {
        findUnique: jest.fn().mockResolvedValue({ bnaSyncEnabled: false, bnaSyncHour: 14 }),
      },
    } as unknown as PrismaService;
    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      {} as InvoicingService,
      makeSchedulerRegistry(),
      makeBnaExchangeRate(),
    );

    const settings = await scheduler.getSettings();

    expect(settings).toEqual({ bnaSyncEnabled: false, bnaSyncHour: 14 });
    expect(prisma.platformSettings.findUnique).toHaveBeenCalledWith({ where: { id: 'global' } });
  });

  it('creates the singleton row with defaults when missing', async () => {
    const prisma = {
      platformSettings: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ bnaSyncEnabled: true, bnaSyncHour: 9 }),
      },
    } as unknown as PrismaService;
    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      {} as InvoicingService,
      makeSchedulerRegistry(),
      makeBnaExchangeRate(),
    );

    const settings = await scheduler.getSettings();

    expect(settings).toEqual({ bnaSyncEnabled: true, bnaSyncHour: 9 });
    expect(prisma.platformSettings.create).toHaveBeenCalledWith({ data: { id: 'global' } });
  });
});

describe('ExchangeRateSchedulerService.updateSettings', () => {
  it('rejects an hour outside 0-23', async () => {
    const prisma = { platformSettings: { upsert: jest.fn() } } as unknown as PrismaService;
    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      {} as InvoicingService,
      makeSchedulerRegistry(),
      makeBnaExchangeRate(),
    );

    await expect(scheduler.updateSettings({ hour: 24 })).rejects.toThrow(BadRequestException);
    await expect(scheduler.updateSettings({ hour: -1 })).rejects.toThrow(BadRequestException);
    expect(prisma.platformSettings.upsert).not.toHaveBeenCalled();
  });

  it('persists the patch and reschedules the cron job only when the hour changes', async () => {
    const prisma = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({ bnaSyncEnabled: false, bnaSyncHour: 18 }),
      },
    } as unknown as PrismaService;
    const cronJob = { setTime: jest.fn() };
    const schedulerRegistry = {
      addCronJob: jest.fn(),
      getCronJob: jest.fn().mockReturnValue(cronJob),
    } as unknown as SchedulerRegistry;
    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      {} as InvoicingService,
      schedulerRegistry,
      makeBnaExchangeRate(),
    );

    await scheduler.updateSettings({ enabled: false, hour: 18 });

    expect(prisma.platformSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'global' },
        update: { bnaSyncEnabled: false, bnaSyncHour: 18 },
      }),
    );
    expect(schedulerRegistry.getCronJob).toHaveBeenCalledWith('bna-sync');
    expect(cronJob.setTime).toHaveBeenCalled();
  });

  it('does not touch the cron schedule when only the enabled flag changes', async () => {
    const prisma = {
      platformSettings: {
        upsert: jest.fn().mockResolvedValue({ bnaSyncEnabled: false, bnaSyncHour: 9 }),
      },
    } as unknown as PrismaService;
    const schedulerRegistry = makeSchedulerRegistry();
    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      {} as InvoicingService,
      schedulerRegistry,
      makeBnaExchangeRate(),
    );

    await scheduler.updateSettings({ enabled: false });

    expect(schedulerRegistry.getCronJob).not.toHaveBeenCalled();
  });
});

describe('ExchangeRateSchedulerService.syncBnaRateForAllTenants', () => {
  it('fetches the official rate once and records it only for tenants that already have a USD currency', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const invoicingService = {
      recordExchangeRate: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoicingService;
    const bnaExchangeRate = makeBnaExchangeRate();
    getTenantDb
      .mockReturnValueOnce({ currency: { findFirst: jest.fn().mockResolvedValue({ id: 'usd-1' }) } })
      .mockReturnValueOnce({ currency: { findFirst: jest.fn().mockResolvedValue(null) } });

    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      invoicingService,
      makeSchedulerRegistry(),
      bnaExchangeRate,
    );

    const result = await scheduler.syncBnaRateForAllTenants();

    expect(bnaExchangeRate.getOfficialUsdRate).toHaveBeenCalledTimes(1);
    expect(invoicingService.recordExchangeRate).toHaveBeenCalledTimes(1);
    expect(invoicingService.recordExchangeRate).toHaveBeenCalledWith({ currencyId: 'usd-1', rate: 1050 });
    expect(result).toEqual({ synced: 1, skipped: 1 });
  });

  it('logs and continues past a tenant that throws, instead of aborting the sweep', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const invoicingService = {
      recordExchangeRate: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoicingService;
    withTenantContext.mockImplementationOnce(() => {
      throw new Error('tenant-1 boom');
    });
    withTenantContext.mockImplementationOnce((_prisma, _tenantId, fn) => fn());
    getTenantDb.mockReturnValue({ currency: { findFirst: jest.fn().mockResolvedValue({ id: 'usd-1' }) } });

    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      invoicingService,
      makeSchedulerRegistry(),
      makeBnaExchangeRate(),
    );

    const result = await scheduler.syncBnaRateForAllTenants();

    expect(result).toEqual({ synced: 1, skipped: 1 });
  });

  it('records no tenant and reports nothing synced when the fetch itself fails', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }]),
    } as unknown as PrismaService;
    const invoicingService = {
      recordExchangeRate: jest.fn(),
    } as unknown as InvoicingService;
    const bnaExchangeRate = makeBnaExchangeRate({
      getOfficialUsdRate: jest.fn().mockRejectedValue(new Error('network down')),
    });

    const scheduler = new ExchangeRateSchedulerService(
      prisma,
      invoicingService,
      makeSchedulerRegistry(),
      bnaExchangeRate,
    );

    await expect(scheduler.syncBnaRateForAllTenants()).rejects.toThrow('network down');
    expect(invoicingService.recordExchangeRate).not.toHaveBeenCalled();
  });
});
