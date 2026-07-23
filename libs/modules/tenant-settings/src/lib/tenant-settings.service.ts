import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { EmailSenderMode, ReminderTone } from '@plexo/database';
import type { DomainRecords } from 'resend';
import type { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto.js';
import { RESEND_DOMAIN_CLIENT, type ResendDomainsClient } from './resend-domain-client.provider.js';

export interface TenantSettingsView {
  arReminderIntervalDays: number | null;
  emailSenderMode: EmailSenderMode;
  emailFromName: string | null;
  emailFromLocalPart: string | null;
  emailCustomDomain: string | null;
  domainStatus: string | null;
  reminderTone: ReminderTone;
  reminderCcEmail: string | null;
}

export interface DomainRegistrationResult {
  status: string;
  records: DomainRecords[];
}

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(RESEND_DOMAIN_CLIENT) private readonly domains: ResendDomainsClient | null,
  ) {}

  /** No row yet (tenant never visited Preferencias) reads as "everything
   * off" - matches the behavior that existed before this feature, so a
   * tenant that never opens this screen sees nothing change. The row is
   * only created lazily, on the first PATCH. */
  async getSettings(): Promise<TenantSettingsView> {
    const row = await getTenantDb().tenantSettings.findUnique({
      where: { tenantId: getTenantId() },
    });
    return {
      arReminderIntervalDays: row?.arReminderIntervalDays ?? null,
      emailSenderMode: row?.emailSenderMode ?? 'SHARED',
      emailFromName: row?.emailFromName ?? null,
      emailFromLocalPart: row?.emailFromLocalPart ?? null,
      emailCustomDomain: row?.emailCustomDomain ?? null,
      domainStatus: row?.domainStatus ?? null,
      reminderTone: row?.reminderTone ?? 'NEUTRAL',
      reminderCcEmail: row?.reminderCcEmail ?? null,
    };
  }

  /** emailCustomDomain/resendDomainId/domainStatus are never touched here on
   * purpose - see registerCustomDomain/refreshDomainStatus below. */
  async updateSettings(dto: UpdateTenantSettingsDto): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const row = await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        arReminderIntervalDays: dto.arReminderIntervalDays ?? null,
        emailSenderMode: dto.emailSenderMode,
        emailFromName: dto.emailFromName,
        emailFromLocalPart: dto.emailFromLocalPart,
        reminderTone: dto.reminderTone,
        reminderCcEmail: dto.reminderCcEmail ?? null,
      },
      update: {
        arReminderIntervalDays: dto.arReminderIntervalDays,
        emailSenderMode: dto.emailSenderMode,
        emailFromName: dto.emailFromName,
        emailFromLocalPart: dto.emailFromLocalPart,
        reminderTone: dto.reminderTone,
        reminderCcEmail: dto.reminderCcEmail,
      },
    });
    return {
      arReminderIntervalDays: row.arReminderIntervalDays,
      emailSenderMode: row.emailSenderMode,
      emailFromName: row.emailFromName,
      emailFromLocalPart: row.emailFromLocalPart,
      emailCustomDomain: row.emailCustomDomain,
      domainStatus: row.domainStatus,
      reminderTone: row.reminderTone,
      reminderCcEmail: row.reminderCcEmail,
    };
  }

  /** Registers (or, if this tenant already registered this exact domain,
   * re-fetches) a sending domain with Resend under the app's single
   * account - idempotent so retrying after a page refresh doesn't create a
   * duplicate. Returns the DNS records the UI shows the user to add at
   * their registrar. */
  async registerCustomDomain(domain: string): Promise<DomainRegistrationResult> {
    if (!this.domains) {
      throw new BadRequestException(
        'El envío desde dominio propio no está configurado en este servidor',
      );
    }
    const tenantId = getTenantId();
    const existing = await getTenantDb().tenantSettings.findUnique({ where: { tenantId } });

    if (existing?.resendDomainId && existing.emailCustomDomain === domain) {
      const { data, error } = await this.domains.get(existing.resendDomainId);
      if (error || !data) {
        throw new BadRequestException(error?.message ?? 'No se pudo consultar el dominio en Resend');
      }
      await this.persistDomain(tenantId, domain, data.id, data.status);
      return { status: data.status, records: data.records };
    }

    const { data, error } = await this.domains.create({ name: domain });
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'No se pudo registrar el dominio en Resend');
    }
    await this.persistDomain(tenantId, domain, data.id, data.status);
    return { status: data.status, records: data.records };
  }

  /** "Verificar ahora" - kicks off Resend's DNS re-check and reports back
   * the current status, persisting it so resolveEmailFrom (used at
   * send-time) sees it without another Resend call. */
  async refreshDomainStatus(): Promise<DomainRegistrationResult> {
    if (!this.domains) {
      throw new BadRequestException(
        'El envío desde dominio propio no está configurado en este servidor',
      );
    }
    const tenantId = getTenantId();
    const existing = await getTenantDb().tenantSettings.findUnique({ where: { tenantId } });
    if (!existing?.resendDomainId || !existing.emailCustomDomain) {
      throw new BadRequestException('Todavía no registraste un dominio propio');
    }

    await this.domains.verify(existing.resendDomainId);
    const { data, error } = await this.domains.get(existing.resendDomainId);
    if (error || !data) {
      throw new BadRequestException(error?.message ?? 'No se pudo verificar el dominio en Resend');
    }
    await this.persistDomain(tenantId, existing.emailCustomDomain, data.id, data.status);
    return { status: data.status, records: data.records };
  }

  private async persistDomain(
    tenantId: string,
    domain: string,
    resendDomainId: string,
    status: string,
  ): Promise<void> {
    await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId, emailCustomDomain: domain, resendDomainId, domainStatus: status },
      update: { emailCustomDomain: domain, resendDomainId, domainStatus: status },
    });
  }
}
