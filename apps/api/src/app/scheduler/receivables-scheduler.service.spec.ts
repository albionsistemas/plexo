import type { PrismaService } from '@plexo/database';
import type { InvoicingService } from '@plexo/invoicing';
import type { ReceivablesService } from '@plexo/receivables';
import type { TenantSettingsService } from '@plexo/tenant-settings';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn((_prisma: unknown, _tenantId: string, fn: () => unknown) => fn()),
  getTenantDb: jest.fn(),
}));

const { withTenantContext, getTenantDb } = jest.requireMock('@plexo/database') as {
  withTenantContext: jest.Mock;
  getTenantDb: jest.Mock;
};

function makeTenantSettings(arReminderIntervalDays: number | null = null) {
  return { getSettings: jest.fn().mockResolvedValue({ arReminderIntervalDays }) } as unknown as TenantSettingsService;
}

describe('ReceivablesSchedulerService.refreshOverdueInvoicesForAllTenants', () => {
  beforeEach(() => {
    withTenantContext.mockClear();
    withTenantContext.mockImplementation((_prisma, _tenantId, fn) => fn());
  });

  it('sweeps every tenant returned by list_tenant_ids(), refreshing statuses and alerting only customers with an email on file', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;

    const invoiceWithEmail = { id: 'inv-1', customer: { email: 'cliente@demo.com' } };
    const invoiceWithoutEmail = { id: 'inv-2', customer: { email: null } };
    const receivablesService = {
      listInvoicesBecomingOverdue: jest
        .fn()
        .mockResolvedValue([invoiceWithEmail, invoiceWithoutEmail]),
      refreshOverdueStatuses: jest.fn().mockResolvedValue({ updated: 2 }),
      markReminderSent: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReceivablesService;
    const invoicingService = {
      sendOverdueInvoiceAlert: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoicingService;
    const tenantSettingsService = makeTenantSettings(null);

    const scheduler = new ReceivablesSchedulerService(
      prisma,
      receivablesService,
      invoicingService,
      tenantSettingsService,
    );
    await scheduler.refreshOverdueInvoicesForAllTenants();

    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(withTenantContext.mock.calls[0][1]).toBe('tenant-1');
    expect(withTenantContext.mock.calls[1][1]).toBe('tenant-2');
    expect(receivablesService.refreshOverdueStatuses).toHaveBeenCalledTimes(2);
    // Once per tenant (2 tenants x 1 invoice with an email each) = 2, never for the one without an email.
    expect(invoicingService.sendOverdueInvoiceAlert).toHaveBeenCalledTimes(2);
    expect(invoicingService.sendOverdueInvoiceAlert).toHaveBeenCalledWith(
      invoiceWithEmail,
      'cliente@demo.com',
    );
    // Both invoices (even the one with no email) get their clock stamped -
    // an alert not being deliverable doesn't mean it wasn't "handled".
    expect(receivablesService.markReminderSent).toHaveBeenCalledWith(['inv-1', 'inv-2']);
  });

  it('logs and continues past a tenant that throws, instead of aborting the whole sweep', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const receivablesService = {
      listInvoicesBecomingOverdue: jest.fn().mockResolvedValue([]),
      refreshOverdueStatuses: jest.fn().mockResolvedValue({ updated: 0 }),
      markReminderSent: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReceivablesService;
    const invoicingService = {
      sendOverdueInvoiceAlert: jest.fn(),
    } as unknown as InvoicingService;
    const tenantSettingsService = makeTenantSettings(null);

    withTenantContext.mockImplementationOnce(() => {
      throw new Error('tenant-1 boom');
    });

    const scheduler = new ReceivablesSchedulerService(
      prisma,
      receivablesService,
      invoicingService,
      tenantSettingsService,
    );
    await expect(scheduler.refreshOverdueInvoicesForAllTenants()).resolves.toBeUndefined();

    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(withTenantContext.mock.calls[1][1]).toBe('tenant-2');
  });
});

describe('ReceivablesSchedulerService.runReminderSweepForCurrentTenant', () => {
  it('does not send recurring reminders when the tenant has not opted in', async () => {
    const receivablesService = {
      listInvoicesBecomingOverdue: jest.fn().mockResolvedValue([]),
      refreshOverdueStatuses: jest.fn().mockResolvedValue({ updated: 0 }),
      listInvoicesNeedingRecurringReminder: jest.fn(),
      markReminderSent: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReceivablesService;
    const invoicingService = { sendOverdueInvoiceAlert: jest.fn() } as unknown as InvoicingService;
    const tenantSettingsService = makeTenantSettings(null);

    const scheduler = new ReceivablesSchedulerService(
      {} as PrismaService,
      receivablesService,
      invoicingService,
      tenantSettingsService,
    );
    const result = await scheduler.runReminderSweepForCurrentTenant();

    expect(result).toEqual({ becomingOverdue: 0, recurring: 0 });
    expect(receivablesService.listInvoicesNeedingRecurringReminder).not.toHaveBeenCalled();
  });

  it('emails and stamps both the newly-overdue and the recurring batch together, once opted in', async () => {
    const newlyOverdue = { id: 'inv-new', customer: { email: 'new@example.com' } };
    const recurring = { id: 'inv-recurring', customer: { email: 'recurring@example.com' } };
    const receivablesService = {
      listInvoicesBecomingOverdue: jest.fn().mockResolvedValue([newlyOverdue]),
      refreshOverdueStatuses: jest.fn().mockResolvedValue({ updated: 1 }),
      listInvoicesNeedingRecurringReminder: jest.fn().mockResolvedValue([recurring]),
      markReminderSent: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReceivablesService;
    const invoicingService = {
      sendOverdueInvoiceAlert: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoicingService;
    const tenantSettingsService = makeTenantSettings(7);

    const scheduler = new ReceivablesSchedulerService(
      {} as PrismaService,
      receivablesService,
      invoicingService,
      tenantSettingsService,
    );
    const result = await scheduler.runReminderSweepForCurrentTenant();

    expect(result).toEqual({ becomingOverdue: 1, recurring: 1 });
    expect(receivablesService.listInvoicesNeedingRecurringReminder).toHaveBeenCalledWith(7);
    expect(invoicingService.sendOverdueInvoiceAlert).toHaveBeenCalledTimes(2);
    // Both batches stamped in the single call at the end, not two separate ones.
    expect(receivablesService.markReminderSent).toHaveBeenCalledTimes(1);
    expect(receivablesService.markReminderSent).toHaveBeenCalledWith(['inv-new', 'inv-recurring']);
  });
});

describe('ReceivablesSchedulerService.resetReminderClockForCurrentTenant', () => {
  it('stamps every currently-OVERDUE invoice without sending any email', async () => {
    const overdue = [{ id: 'inv-1' }, { id: 'inv-2' }];
    const findMany = jest.fn().mockResolvedValue(overdue);
    getTenantDb.mockReturnValue({ invoice: { findMany } });

    const receivablesService = {
      markReminderSent: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReceivablesService;
    const invoicingService = { sendOverdueInvoiceAlert: jest.fn() } as unknown as InvoicingService;
    const tenantSettingsService = makeTenantSettings(null);

    const scheduler = new ReceivablesSchedulerService(
      {} as PrismaService,
      receivablesService,
      invoicingService,
      tenantSettingsService,
    );
    const result = await scheduler.resetReminderClockForCurrentTenant();

    expect(findMany).toHaveBeenCalledWith({
      where: { balanceDue: { gt: 0 }, status: 'OVERDUE' },
      select: { id: true },
    });
    expect(receivablesService.markReminderSent).toHaveBeenCalledWith(['inv-1', 'inv-2']);
    expect(invoicingService.sendOverdueInvoiceAlert).not.toHaveBeenCalled();
    expect(result).toEqual({ reset: 2 });
  });
});
