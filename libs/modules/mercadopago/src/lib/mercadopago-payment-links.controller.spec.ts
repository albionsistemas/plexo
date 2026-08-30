import type { MercadoPagoPaymentService } from './mercadopago-payment.service.js';
import { MercadoPagoPaymentLinksController } from './mercadopago-payment-links.controller.js';

function makePaymentService(overrides: Partial<jest.Mocked<MercadoPagoPaymentService>> = {}) {
  return {
    createPaymentLink: jest.fn(),
    getPaymentLink: jest.fn(),
    cancelPaymentLink: jest.fn(),
    ...overrides,
  } as unknown as jest.Mocked<MercadoPagoPaymentService>;
}

describe('MercadoPagoPaymentLinksController', () => {
  it('create() delegates to the service with the DTO as-is', async () => {
    const paymentService = makePaymentService({
      createPaymentLink: jest.fn().mockResolvedValue({ id: 'intent-1' }),
    } as never);
    const controller = new MercadoPagoPaymentLinksController(paymentService);

    const result = await controller.create({ documentType: 'INVOICE', documentId: 'invoice-1' });

    expect(paymentService.createPaymentLink).toHaveBeenCalledWith({
      documentType: 'INVOICE',
      documentId: 'invoice-1',
    });
    expect(result).toEqual({ id: 'intent-1' });
  });

  it('get() delegates to the service with the parsed id', async () => {
    const paymentService = makePaymentService({
      getPaymentLink: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'PENDING' }),
    } as never);
    const controller = new MercadoPagoPaymentLinksController(paymentService);

    const result = await controller.get('intent-1');

    expect(paymentService.getPaymentLink).toHaveBeenCalledWith('intent-1');
    expect(result).toEqual({ id: 'intent-1', status: 'PENDING' });
  });

  it('cancel() delegates to the service with the parsed id', async () => {
    const paymentService = makePaymentService({
      cancelPaymentLink: jest.fn().mockResolvedValue({ id: 'intent-1', status: 'CANCELLED' }),
    } as never);
    const controller = new MercadoPagoPaymentLinksController(paymentService);

    const result = await controller.cancel('intent-1');

    expect(paymentService.cancelPaymentLink).toHaveBeenCalledWith('intent-1');
    expect(result).toEqual({ id: 'intent-1', status: 'CANCELLED' });
  });
});
