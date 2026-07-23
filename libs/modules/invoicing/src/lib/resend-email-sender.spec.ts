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

  it('uses the per-tenant custom from-address when given, overriding the constructor default', async () => {
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendInvoiceEmail({
      to: 'cliente@demo.com',
      invoiceNumber: 'B-0001',
      total: '121.00',
      from: 'Facturación Acme <facturas@acme.com>',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Facturación Acme <facturas@acme.com>' }),
    );
  });
});

describe('ResendEmailSender.sendOverdueAlertEmail', () => {
  beforeEach(() => {
    sendMock.mockReset();
    sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
  });

  const basePayload = {
    to: 'cliente@demo.com',
    invoiceNumber: 'B-0001',
    balanceDue: '121.00',
    dueDate: '1/7/2026',
  };

  it('defaults to the NEUTRAL wording when no tone is given', async () => {
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendOverdueAlertEmail(basePayload);

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        from: 'facturas@plexo.demo',
        subject: 'Factura B-0001 vencida',
        text: expect.stringContaining('está vencida desde el 1/7/2026'),
      }),
    );
  });

  it('uses the FRIENDLY wording when selected', async () => {
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendOverdueAlertEmail({ ...basePayload, tone: 'FRIENDLY' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Recordatorio'),
        text: expect.stringContaining('¡Hola!'),
      }),
    );
  });

  it('uses the FIRM wording when selected', async () => {
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendOverdueAlertEmail({ ...basePayload, tone: 'FIRM' });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining('Aviso de pago pendiente'),
        text: expect.stringContaining('evitar inconvenientes'),
      }),
    );
  });

  it('uses the per-tenant custom from-address when given', async () => {
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendOverdueAlertEmail({
      ...basePayload,
      from: 'Facturación Acme <facturas@acme.com>',
    });

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'Facturación Acme <facturas@acme.com>' }),
    );
  });

  it('CCs the internal mailbox when one is configured', async () => {
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendOverdueAlertEmail({ ...basePayload, cc: 'cobranzas@acme.com' });

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ cc: 'cobranzas@acme.com' }));
  });

  it('omits cc when none is configured', async () => {
    const sender = new ResendEmailSender('re_test_key', 'facturas@plexo.demo');

    await sender.sendOverdueAlertEmail(basePayload);

    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ cc: undefined }));
  });
});
