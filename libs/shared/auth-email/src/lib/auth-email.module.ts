import { Logger, Module } from '@nestjs/common';
import { AUTH_EMAIL_SENDER, type AuthEmailSender } from './auth-email-sender.port.js';
import { ConsoleAuthEmailSender } from './console-auth-email-sender.js';
import { ResendAuthEmailSender } from './resend-auth-email-sender.js';

const logger = new Logger('AuthEmailModule');

/** Global config, no per-tenant - mismo criterio y mismas env vars
 * (RESEND_API_KEY/EMAIL_FROM) que createEmailSender() en InvoicingModule.
 * Cae al stub de consola si no están seteadas. */
function createAuthEmailSender(): AuthEmailSender {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['EMAIL_FROM'];
  if (!apiKey || !from) {
    logger.warn('RESEND_API_KEY/EMAIL_FROM not set - auth emails will only be logged, not sent');
    return new ConsoleAuthEmailSender();
  }
  return new ResendAuthEmailSender(apiKey, from);
}

@Module({
  providers: [{ provide: AUTH_EMAIL_SENDER, useFactory: createAuthEmailSender }],
  exports: [AUTH_EMAIL_SENDER],
})
export class AuthEmailModule {}
