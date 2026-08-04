import { Logger, Module } from '@nestjs/common';
import { AfipCredentialsModule } from '@plexo/afip-credentials';
import { SubscriptionModule } from '@plexo/subscriptions';
import { ConsoleEmailSender } from './console-email-sender.js';
import type { EmailSender } from './email-sender.port.js';
import { EMAIL_SENDER } from './email-sender.port.js';
import { ELECTRONIC_INVOICING } from './electronic-invoicing.port.js';
import { InvoicingController } from './invoicing.controller.js';
import { InvoicingService } from './invoicing.service.js';
import { RealElectronicInvoicingService } from './real-electronic-invoicing.js';
import { ResendEmailSender } from './resend-email-sender.js';

const logger = new Logger('InvoicingModule');

/**
 * Global config, not per-tenant: one Resend account/from-address for the
 * whole app, same convention as JWT_SECRET/DATABASE_URL. Falls back to the
 * console stub when RESEND_API_KEY isn't set, so local/dev environments
 * keep working without one - see ConsoleEmailSender.
 */
function createEmailSender(): EmailSender {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['EMAIL_FROM'];
  if (!apiKey || !from) {
    logger.warn(
      'RESEND_API_KEY/EMAIL_FROM not set - invoice emails will only be logged, not sent',
    );
    return new ConsoleEmailSender();
  }
  return new ResendEmailSender(apiKey, from);
}

@Module({
  imports: [AfipCredentialsModule, SubscriptionModule],
  controllers: [InvoicingController],
  providers: [
    InvoicingService,
    { provide: EMAIL_SENDER, useFactory: createEmailSender },
    { provide: ELECTRONIC_INVOICING, useClass: RealElectronicInvoicingService },
  ],
  exports: [InvoicingService],
})
export class InvoicingModule {}
