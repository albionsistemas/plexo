import type { TiendanubeWebhookService } from './tiendanube-webhook.service.js';
import { TiendanubeWebhookController } from './tiendanube-webhook.controller.js';

function makeService(): jest.Mocked<TiendanubeWebhookService> {
  return { handleNotification: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<TiendanubeWebhookService>;
}

describe('TiendanubeWebhookController', () => {
  it('extracts store_id/event/id from the body and forwards the raw bytes main.ts captured', async () => {
    const service = makeService();
    const controller = new TiendanubeWebhookController(service);
    const rawBody = Buffer.from('{"store_id":999,"event":"order/paid","id":555}');

    await controller.handle('deadbeef', { rawBody } as never, { store_id: 999, event: 'order/paid', id: 555 });

    expect(service.handleNotification).toHaveBeenCalledWith({
      signatureHeader: 'deadbeef',
      rawBody,
      storeId: '999',
      event: 'order/paid',
      orderId: '555',
      payload: { store_id: 999, event: 'order/paid', id: 555 },
    });
  });

  it('falls back to an empty buffer when main.ts never captured rawBody (defensive, should not happen in practice)', async () => {
    const service = makeService();
    const controller = new TiendanubeWebhookController(service);

    await controller.handle(undefined, {} as never, undefined);

    expect(service.handleNotification).toHaveBeenCalledWith(
      expect.objectContaining({ rawBody: Buffer.from(''), storeId: undefined, event: undefined, orderId: undefined }),
    );
  });

  it('ping() responds without requiring auth (smoke check Tiendanube can hit)', () => {
    const controller = new TiendanubeWebhookController(makeService());

    expect(controller.ping()).toBe('ok');
  });
});
