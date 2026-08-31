import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { Public } from '@plexo/auth';
import type { FastifyRequest } from 'fastify';
import { TiendanubeWebhookService } from './tiendanube-webhook.service.js';

interface TiendanubeWebhookBody {
  store_id?: number | string;
  event?: string;
  id?: number | string;
}

/**
 * @Public() - Tiendanube calls this server-to-server, never carrying (and
 * never expected to carry) an OPLEX session token. `x-linkedstore-hmac-
 * sha256` verified against TIENDANUBE_CLIENT_SECRET is the only
 * authentication this route has - see
 * TiendanubeWebhookService.handleNotification.
 *
 * `store_id`/`event`/`id` arrive directly in the JSON body (unlike Mercado
 * Pago, which needed a `?client=<tenantId>` query-string trick on the
 * notification_url) - see find_tenant_by_connector() in the
 * 20260912000000_tiendanube_orders migration for how the tenant gets
 * resolved from `store_id` alone.
 */
@Controller('webhooks/tiendanube')
export class TiendanubeWebhookController {
  constructor(private readonly webhookService: TiendanubeWebhookService) {}

  @Public()
  @Get()
  ping(): string {
    return 'ok';
  }

  @Public()
  @Post()
  @HttpCode(200)
  async handle(
    @Headers('x-linkedstore-hmac-sha256') signatureHeader: string | undefined,
    @Req() request: FastifyRequest & { rawBody?: Buffer },
    @Body() body: TiendanubeWebhookBody | undefined,
  ): Promise<void> {
    await this.webhookService.handleNotification({
      signatureHeader,
      // main.ts's content-type parser override stamps this on every
      // request - see its own doc comment for why the raw bytes (not the
      // re-parsed `body`) are what the signature actually covers.
      rawBody: request.rawBody ?? Buffer.from(''),
      storeId: body?.store_id != null ? String(body.store_id) : undefined,
      event: body?.event,
      orderId: body?.id != null ? String(body.id) : undefined,
      payload: body,
    });
  }
}
