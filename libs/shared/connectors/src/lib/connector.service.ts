import { Injectable } from '@nestjs/common';
import { getTenantDb, getTenantId, type Connector, type ConnectorProvider, type ConnectorStatus } from '@plexo/database';
import { EncryptionService } from '@plexo/encryption';

/**
 * Facade every concrete ProviderConnector implementation (MercadoPagoConnector
 * today) uses to read/write its own Connector row and secrets, without ever
 * touching Prisma or EncryptionService directly. Always operates on the
 * CURRENT tenant (getTenantId()/getTenantDb()) - same convention as
 * AfipCredentialsService.getCurrent(), deliberately not something that takes
 * tenantId as a parameter, since every caller already runs inside a
 * request's tenant context by the time it needs this.
 */
@Injectable()
export class ConnectorService {
  constructor(private readonly encryption: EncryptionService) {}

  /** null = this tenant never started connecting this provider. */
  getConnector(provider: ConnectorProvider): Promise<Connector | null> {
    return getTenantDb().connector.findFirst({ where: { provider } });
  }

  /**
   * Starts (or resumes) a connection: returns the existing row for this
   * provider if one already exists - PENDING from a previous, abandoned
   * OAuth attempt included - so callers never create duplicate Connector
   * rows for the same (tenant, provider) pair (the DB's own
   * @@unique([tenantId, provider]) would reject a second insert anyway,
   * this just avoids relying on catching that).
   */
  async getOrCreateConnector(provider: ConnectorProvider): Promise<Connector> {
    const existing = await this.getConnector(provider);
    if (existing) {
      return existing;
    }
    return getTenantDb().connector.create({
      data: { tenantId: getTenantId(), provider },
    });
  }

  /**
   * Encrypts `plaintext` and stores it under `key` for this connector,
   * overwriting whatever was there before - a MP token refresh calls this
   * again with the same key, never accumulates rows (see
   * @@unique([connectorId, key])).
   */
  async saveSecret(
    connectorId: string,
    key: string,
    plaintext: string,
    expiresAt?: Date,
  ): Promise<void> {
    const value = this.encryption.encrypt(plaintext);
    await getTenantDb().connectorSecret.upsert({
      where: { connectorId_key: { connectorId, key } },
      create: { tenantId: getTenantId(), connectorId, key, value, expiresAt },
      update: { value, expiresAt },
    });
  }

  /** null = no secret stored under that key for this connector. Decrypts
   * in memory, never persists the plaintext anywhere. */
  async getSecret(connectorId: string, key: string): Promise<string | null> {
    const secret = await getTenantDb().connectorSecret.findUnique({
      where: { connectorId_key: { connectorId, key } },
    });
    return secret ? this.encryption.decrypt(secret.value) : null;
  }

  setStatus(connectorId: string, status: ConnectorStatus, errorMessage?: string): Promise<Connector> {
    return getTenantDb().connector.update({
      where: { id: connectorId },
      data: {
        status,
        lastErrorAt: status === 'ERROR' ? new Date() : undefined,
        lastErrorMessage: status === 'ERROR' ? errorMessage : undefined,
      },
    });
  }

  /** No-op if this tenant never connected `provider` - disconnecting
   * something that was never connected isn't an error. */
  async disconnect(provider: ConnectorProvider): Promise<void> {
    const connector = await this.getConnector(provider);
    if (!connector) {
      return;
    }
    await getTenantDb().connectorSecret.deleteMany({ where: { connectorId: connector.id } });
    await getTenantDb().connector.update({
      where: { id: connector.id },
      data: { status: 'DISCONNECTED' },
    });
  }
}
