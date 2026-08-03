import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import type {
  AfipEnvironment,
  EmailSenderMode,
  ReminderTone,
  TenantSettings,
  TenantTaxCondition,
} from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';
import type { DomainRecords } from 'resend';
import { parseAndValidateAfipCertificate } from './afip-certificate.js';
import type { UpdateTenantInfoDto } from './dto/update-tenant-info.dto.js';
import type { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto.js';
import type { UploadAfipCertificateDto } from './dto/upload-afip-certificate.dto.js';
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
  withholdingAgentIncomeTax: boolean;
  withholdingAgentVat: boolean;
  withholdingAgentGrossIncome: boolean;
  afipEnv: AfipEnvironment;
  // Never the decrypted cert/key themselves - just whether one is on file,
  // so the frontend can show "certificado cargado" vs. an upload prompt.
  afipConfigured: boolean;
  afipCertExpiresAt: Date | null;
  // Condición IVA propia del tenant - null hasta que el usuario la
  // configure a mano en Preferencias. Alimenta resolveDocumentLetter en el
  // frontend (letra A/B/C sugerida/forzada al emitir factura).
  ownTaxCondition: TenantTaxCondition | null;
  // Tenant.taxId (the tenant's OWN CUIT - who the AFIP certificate is
  // registered under), surfaced here because Preferencias/AFIP is the only
  // screen that needs to show/edit it today - see updateTenantInfo. Not a
  // TenantSettings column; it lives on Tenant, joined in on every read.
  tenantTaxId: string | null;
}

export interface DomainRegistrationResult {
  status: string;
  records: DomainRecords[];
}

@Injectable()
export class TenantSettingsService {
  constructor(
    @Inject(RESEND_DOMAIN_CLIENT) private readonly domains: ResendDomainsClient | null,
    private readonly encryption: EncryptionService,
  ) {}

  /** No row yet (tenant never visited Preferencias) reads as "everything
   * off" - matches the behavior that existed before this feature, so a
   * tenant that never opens this screen sees nothing change. The row is
   * only created lazily, on the first PATCH. */
  async getSettings(): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const [row, tenant] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ]);
    return this.toView(row, tenant.taxId);
  }

  private async getTenantTaxId(): Promise<string | null> {
    const tenant = await getTenantDb().tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    return tenant.taxId;
  }

  /** The tenant's own CUIT - lives on Tenant, not TenantSettings, but this
   * is the only screen that edits it, so it's exposed through this service
   * rather than adding a whole separate module for one field. */
  async updateTenantInfo(dto: UpdateTenantInfoDto): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    await db.tenant.update({ where: { id: tenantId }, data: { taxId: dto.taxId } });
    const row = await db.tenantSettings.findUnique({ where: { tenantId } });
    return this.toView(row, dto.taxId);
  }

  private toView(row: TenantSettings | null, tenantTaxId: string | null): TenantSettingsView {
    return {
      arReminderIntervalDays: row?.arReminderIntervalDays ?? null,
      emailSenderMode: row?.emailSenderMode ?? 'SHARED',
      emailFromName: row?.emailFromName ?? null,
      emailFromLocalPart: row?.emailFromLocalPart ?? null,
      emailCustomDomain: row?.emailCustomDomain ?? null,
      domainStatus: row?.domainStatus ?? null,
      reminderTone: row?.reminderTone ?? 'NEUTRAL',
      reminderCcEmail: row?.reminderCcEmail ?? null,
      withholdingAgentIncomeTax: row?.withholdingAgentIncomeTax ?? false,
      withholdingAgentVat: row?.withholdingAgentVat ?? false,
      withholdingAgentGrossIncome: row?.withholdingAgentGrossIncome ?? false,
      afipEnv: row?.afipEnv ?? 'HOMOLOGACION',
      // Mirrors AfipCredentialsService.getCurrent()'s own "configured"
      // check exactly (cert+key AND the tenant's own CUIT) - otherwise this
      // flag could say "listo" while WSFE calls still fail for missing the
      // CUIT half of it.
      afipConfigured: Boolean(row?.afipCertEncrypted && row?.afipKeyEncrypted && tenantTaxId),
      afipCertExpiresAt: row?.afipCertExpiresAt ?? null,
      ownTaxCondition: row?.ownTaxCondition ?? null,
      tenantTaxId,
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
        withholdingAgentIncomeTax: dto.withholdingAgentIncomeTax,
        withholdingAgentVat: dto.withholdingAgentVat,
        withholdingAgentGrossIncome: dto.withholdingAgentGrossIncome,
        ownTaxCondition: dto.ownTaxCondition ?? null,
      },
      update: {
        arReminderIntervalDays: dto.arReminderIntervalDays,
        emailSenderMode: dto.emailSenderMode,
        emailFromName: dto.emailFromName,
        emailFromLocalPart: dto.emailFromLocalPart,
        reminderTone: dto.reminderTone,
        reminderCcEmail: dto.reminderCcEmail,
        withholdingAgentIncomeTax: dto.withholdingAgentIncomeTax,
        withholdingAgentVat: dto.withholdingAgentVat,
        withholdingAgentGrossIncome: dto.withholdingAgentGrossIncome,
        ownTaxCondition: dto.ownTaxCondition,
      },
    });
    return this.toView(row, await this.getTenantTaxId());
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

  /** Validates the cert/key pair, encrypts both with EncryptionService and
   * upserts them - the plaintext PEMs never touch the database or a log
   * line, only this in-memory validation step. Overwrites whatever was
   * there before, if anything (re-uploading is how a tenant rotates an
   * expiring certificate). */
  async uploadAfipCertificate(dto: UploadAfipCertificateDto): Promise<TenantSettingsView> {
    let expiresAt: Date;
    try {
      ({ expiresAt } = parseAndValidateAfipCertificate(dto.certPem, dto.keyPem));
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    const tenantId = getTenantId();
    const afipCertEncrypted = this.encryption.encrypt(dto.certPem);
    const afipKeyEncrypted = this.encryption.encrypt(dto.keyPem);
    const row = await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        afipEnv: dto.env,
        afipCertEncrypted,
        afipKeyEncrypted,
        afipCertExpiresAt: expiresAt,
      },
      update: {
        afipEnv: dto.env,
        afipCertEncrypted,
        afipKeyEncrypted,
        afipCertExpiresAt: expiresAt,
      },
    });
    return this.toView(row, await this.getTenantTaxId());
  }

  async removeAfipCertificate(): Promise<TenantSettingsView> {
    const tenantId = getTenantId();
    const row = await getTenantDb().tenantSettings.upsert({
      where: { tenantId },
      create: { tenantId },
      update: { afipCertEncrypted: null, afipKeyEncrypted: null, afipCertExpiresAt: null },
    });
    return this.toView(row, await this.getTenantTaxId());
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
