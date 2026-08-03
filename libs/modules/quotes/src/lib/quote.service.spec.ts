import { tenantContextStorage } from '@plexo/database';
import { QuoteService } from './quote.service.js';

function runAsUser<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

function makeService() {
  const numbering = { nextNumber: jest.fn() };
  const pdfGenerator = { generate: jest.fn() };
  const emailSender = { sendQuoteEmail: jest.fn() };
  return new QuoteService(numbering as never, pdfGenerator as never, emailSender as never);
}

describe('QuoteService status transitions', () => {
  it('accept() rejects a quote that has not been SENT yet', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'DRAFT' });
    const db = { quote: { findUnique } };
    const service = makeService();

    await expect(runAsUser(db, () => service.accept('quote-1'))).rejects.toThrow(
      'Only a SENT quote can be accepted or rejected',
    );
  });

  it('accept() transitions a SENT quote to ACCEPTED', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'SENT' });
    const update = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'ACCEPTED' });
    const db = { quote: { findUnique, update } };
    const service = makeService();

    const result = await runAsUser(db, () => service.accept('quote-1'));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'quote-1' }, data: { status: 'ACCEPTED' } }),
    );
    expect(result.status).toBe('ACCEPTED');
  });

  it('cancel() refuses to cancel an already-cancelled quote', async () => {
    const findUnique = jest.fn().mockResolvedValue({ id: 'quote-1', status: 'CANCELLED' });
    const db = { quote: { findUnique } };
    const service = makeService();

    await expect(runAsUser(db, () => service.cancel('quote-1'))).rejects.toThrow(
      'This quote is already cancelled',
    );
  });
});
