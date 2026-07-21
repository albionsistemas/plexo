import { ResendEmailSender } from './resend-email-sender.js';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

describe('ResendEmailSender.sendInvoiceEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('sends with the configured from-address and the invoice details in the body', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendInvoiceEmail({ to: 'cliente@demo.com', invoiceNumber: 'B-0001', total: '121.00' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'facturas@plexo.demo',
        to: 'cliente@demo.com',
        subject: expect.stringContaining('B-0001'),
        text: expect.stringContaining('121.00'),
      }),
    );
  });

  it('logs instead of throwing when Resend returns an error', async () => {
    sendMock.mockResolvedValue({ data: null, error: { message: 'Invalid from address' } });
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await expect(
      sender.sendInvoiceEmail({ to: 'cliente@demo.com', invoiceNumber: 'B-0001', total: '121.00' }),
    ).resolves.toBeUndefined();
  });
});
