import { tenantContextStorage } from '@plexo/database';
import { QuoteNumberingService } from './quote-numbering.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('QuoteNumberingService.nextNumber', () => {
  it('formats quote numbers as PREFIX-000NNN using the pre-increment value', async () => {
    const update = jest.fn().mockResolvedValue({ quoteNextNumber: 5, quotePrefix: 'PRE' });
    const db = { user: { update } };
    const service = new QuoteNumberingService();

    const number = await runAsUser(db, () => service.nextNumber());

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { quoteNextNumber: { increment: 1 } },
      select: { quoteNextNumber: true, quotePrefix: true },
    });
    expect(number).toBe('PRE-000004');
  });

  it('rejects when there is no authenticated user in context', async () => {
    const db = { user: { update: jest.fn() } };
    const service = new QuoteNumberingService();

    await expect(
      tenantContextStorage.run({ tenantId: 'tenant-1', tx: db as never }, () => service.nextNumber()),
    ).rejects.toThrow('An authenticated user is required');
  });
});
