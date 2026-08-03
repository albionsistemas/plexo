import { Logger, Module } from '@nestjs/common';
import { ConsoleQuoteEmailSender } from './email/console-quote-email-sender.js';
import { QUOTE_EMAIL_SENDER, type QuoteEmailSender } from './email/quote-email-sender.port.js';
import { ResendQuoteEmailSender } from './email/resend-quote-email-sender.js';
import { PdfGeneratorService } from './pdf/pdf-generator.service.js';
import { QuoteController } from './quote.controller.js';
import { QuoteNumberingService } from './quote-numbering.service.js';
import { QuotePreferencesController } from './quote-preferences.controller.js';
import { QuotePreferencesService } from './quote-preferences.service.js';
import { QuoteService } from './quote.service.js';

const logger = new Logger('QuotesModule');

/** Same "global config, not per-tenant" convention as PurchasesModule's
 * createPurchaseEmailSender - one Resend account/from-address for the whole
 * app, falls back to the console stub when RESEND_API_KEY isn't set. A
 * third, independent Resend client from invoicing's/purchases' on purpose -
 * see quote-email-sender.port.ts for why. */
function createQuoteEmailSender(): QuoteEmailSender {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['EMAIL_FROM'];
  if (!apiKey || !from) {
    logger.warn('RESEND_API_KEY/EMAIL_FROM not set - quote emails will only be logged, not sent');
    return new ConsoleQuoteEmailSender();
  }
  return new ResendQuoteEmailSender(apiKey, from);
}

@Module({
  controllers: [QuotePreferencesController, QuoteController],
  providers: [
    QuoteNumberingService,
    QuotePreferencesService,
    PdfGeneratorService,
    QuoteService,
    { provide: QUOTE_EMAIL_SENDER, useFactory: createQuoteEmailSender },
  ],
  exports: [QuoteService],
})
export class QuotesModule {}
