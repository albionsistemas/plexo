import { Logger } from '@nestjs/common';
import { Resend } from 'resend';

export const RESEND_DOMAIN_CLIENT = Symbol('RESEND_DOMAIN_CLIENT');

export type ResendDomainsClient = Resend['domains'];

const logger = new Logger('TenantSettingsModule');

/**
 * Same global RESEND_API_KEY the invoicing module already uses (see
 * InvoicingModule.createEmailSender) - domain registration/verification is
 * an account-level Resend API, not a per-tenant one, so no new secret is
 * needed here. null when unset, so registerCustomDomain/refreshDomainStatus
 * can fail with a clear message instead of crashing at bootstrap.
 */
export function createResendDomainClient(): ResendDomainsClient | null {
  const apiKey = process.env['RESEND_API_KEY'];
  if (!apiKey) {
    logger.warn('RESEND_API_KEY not set - custom sending domains cannot be registered');
    return null;
  }
  return new Resend(apiKey).domains;
}
