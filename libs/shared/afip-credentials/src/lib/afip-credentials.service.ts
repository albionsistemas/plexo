import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';

export interface AfipCredentials {
  certPem: string;
  keyPem: string;
  /** The CUIT the certificate is registered under - who's "asking" AFIP,
   * not the CUIT being looked up/invoiced. Always the current tenant's own
   * Tenant.taxId. */
  cuitRepresentada: string;
  env: 'homologacion' | 'produccion';
}

/**
 * Resolves the CURRENT tenant's AFIP credentials at call time - deliberately
 * not something baked into a service's constructor via a factory provider,
 * since a factory provider runs once at app boot, before any
 * request/tenant context exists (one certificate for the whole instance,
 * incompatible with multi-tenant - the trap both WSFE and the padrón
 * lookup used to fall into with process-wide env vars). Every consumer
 * (padrón lookup, WSFE) must call getCurrent() from inside the method that
 * actually needs it, so it always reads whichever tenant is active for
 * that request.
 */
@Injectable()
export class AfipCredentialsService {
  constructor(private readonly encryption: EncryptionService) {}

  /** null = this tenant hasn't uploaded a certificate yet, or has no CUIT
   * set - callers should surface a clear "not configured" error to the user
   * action that triggered it (same convention as StubAfipPadronService),
   * not throw here. */
  async getCurrent(): Promise<AfipCredentials | null> {
    const tenantId = getTenantId();
    const db = getTenantDb();
    const [settings, tenant] = await Promise.all([
      db.tenantSettings.findUnique({ where: { tenantId } }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
    ]);

    if (!settings?.afipCertEncrypted || !settings.afipKeyEncrypted || !tenant.taxId) {
      return null;
    }

    return {
      certPem: this.encryption.decrypt(settings.afipCertEncrypted),
      keyPem: this.encryption.decrypt(settings.afipKeyEncrypted),
      cuitRepresentada: tenant.taxId,
      env: settings.afipEnv === 'PRODUCCION' ? 'produccion' : 'homologacion',
    };
  }
}
