import { Body, Controller, Get, Headers, HttpCode, Post, Query } from '@nestjs/common';
import { Public } from '@plexo/auth';
import { MercadoPagoWebhookService } from './mercadopago-webhook.service.js';

interface MercadoPagoWebhookBody {
  type?: string;
  data?: { id?: string };
}

/**
 * @Public() - MP calls this server-to-server, never carrying (and never
 * expected to carry) an OPLEX session token. `x-signature`/`x-request-id`
 * verified against MP_WEBHOOK_SECRET is the only authentication this
 * route has - see MercadoPagoWebhookService.handleNotification.
 *
 * `data.id`/`type` can arrive either in the JSON body or as query params
 * (MP sends both on the same notification, appended to whatever
 * notification_url we gave it, including our own `?client=<tenantId>` -
 * see MercadoPagoConfigService.webhookNotificationUrl) - body wins when
 * both are present, query is the fallback.
 */
@Controller('webhooks/mercadopago')
export class MercadoPagoWebhookController {
  constructor(private readonly webhookService: MercadoPagoWebhookService) {}

  @Public()
  @Get()
  ping(): string {
    return 'ok';
  }

  @Public()
  @Post()
  @HttpCode(200)
  async handle(
    @Headers('x-signature') signatureHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, string | undefined>,
    @Body() body: MercadoPagoWebhookBody | undefined,
  ): Promise<void> {
    await this.webhookService.handleNotification({
      signatureHeader,
      requestId,
      dataId: body?.data?.id ?? query['data.id'],
      type: body?.type ?? query['type'],
      tenantIdParam: query['client'],
      payload: body,
    });
  }
}
