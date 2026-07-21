import type { PrismaService } from '@plexo/database';
import type { InvoicingService } from '@plexo/invoicing';
import type { ReceivablesService } from '@plexo/receivables';
import { ReceivablesSchedulerService } from './receivables-scheduler.service.js';

jest.mock('@plexo/database', () => ({
  ...jest.requireActual('@plexo/database'),
  withTenantContext: jest.fn((_prisma: unknown, _tenantId: string, fn: () => unknown) => fn()),
}));

const { withTenantContext } = jest.requireMock('@plexo/database') as {
  withTenantContext: jest.Mock;
};

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
    } as unknown as ReceivablesService;
    const invoicingService = {
      sendOverdueInvoiceAlert: jest.fn().mockResolvedValue(undefined),
    } as unknown as InvoicingService;

    const scheduler = new ReceivablesSchedulerService(prisma, receivablesService, invoicingService);
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
  });

  it('logs and continues past a tenant that throws, instead of aborting the whole sweep', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: 'tenant-1' }, { id: 'tenant-2' }]),
    } as unknown as PrismaService;
    const receivablesService = {
      listInvoicesBecomingOverdue: jest.fn().mockResolvedValue([]),
      refreshOverdueStatuses: jest.fn().mockResolvedValue({ updated: 0 }),
    } as unknown as ReceivablesService;
    const invoicingService = {
      sendOverdueInvoiceAlert: jest.fn(),
    } as unknown as InvoicingService;

    withTenantContext.mockImplementationOnce(() => {
      throw new Error('tenant-1 boom');
    });

    const scheduler = new ReceivablesSchedulerService(prisma, receivablesService, invoicingService);
    await expect(scheduler.refreshOverdueInvoicesForAllTenants()).resolves.toBeUndefined();

    expect(withTenantContext).toHaveBeenCalledTimes(2);
    expect(withTenantContext.mock.calls[1][1]).toBe('tenant-2');
  });
});
