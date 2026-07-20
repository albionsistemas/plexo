import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma } from '../generated/client.js';

export interface TenantStore {
  tenantId: string;
  tx: Prisma.TransactionClient;
}

/**
 * Carries the current request's tenant id and its RLS-scoped transaction
 * client through the async call chain, so business services can reach it
 * without needing REQUEST-scoped Nest providers. Populated by
 * TenantContextInterceptor, one store per request.
 */
export const tenantContextStorage = new AsyncLocalStorage<TenantStore>();

function requireStore(): TenantStore {
  const store = tenantContextStorage.getStore();
  if (!store) {
    throw new Error(
      'No tenant context active. Is TenantContextInterceptor registered for this route?',
    );
  }
  return store;
}

export function getTenantId(): string {
  return requireStore().tenantId;
}

/**
 * The Prisma client to use for the current request. This is a transaction
 * client with `app.tenant_id` already set via set_config(), so RLS policies
 * apply. Never use the bare PrismaService client for tenant-scoped queries.
 */
export function getTenantDb(): Prisma.TransactionClient {
  return requireStore().tx;
}
