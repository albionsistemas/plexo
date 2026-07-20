import { AsyncLocalStorage } from 'node:async_hooks';
import type { Prisma, PrismaClient } from '../generated/client.js';

export interface TenantStore {
  tenantId: string;
  userId?: string;
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
 * The acting user's id, if any (unset during login - there's no user yet).
 * Business code that needs "who did this" (e.g. changedById on
 * PriceHistory) reads this instead of pulling it off the request directly.
 */
export function getUserId(): string | undefined {
  return requireStore().userId;
}

/**
 * The Prisma client to use for the current request. This is a transaction
 * client with `app.tenant_id` already set via set_config(), so RLS policies
 * apply. Never use the bare PrismaService client for tenant-scoped queries.
 */
export function getTenantDb(): Prisma.TransactionClient {
  return requireStore().tx;
}

/**
 * Opens one transaction, sets app.tenant_id (and app.user_id, if known) on
 * it, and runs `fn` with the tenant context active so
 * getTenantId()/getTenantDb() resolve inside it. Shared by
 * TenantContextInterceptor (per authenticated HTTP request) and anything
 * that needs a tenant-scoped query before a request pipeline exists —
 * login being the obvious case: there's no request.user yet to key an
 * interceptor off of, but we still must query `users` under RLS.
 *
 * app.user_id is read by the audit_log_capture() trigger (see the
 * audit-log-immutability migration) to fill in `changedBy` - it's the only
 * reason it's threaded through here at all, business code should keep
 * using getTenantId(), not this.
 */
export async function withTenantContext<T>(
  prisma: PrismaClient,
  tenantId: string,
  fn: () => Promise<T>,
  userId?: string,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    if (userId) {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    }
    return tenantContextStorage.run({ tenantId, userId, tx }, fn);
  });
}
