// Loads .env the same way apps/api/src/main.ts does ('import "dotenv/config"')
// - this file is only ever loaded from the dedicated `test-rls` Jest target
// (see jest.rls.config.cts), never from the normal `test` target, so this
// doesn't affect any other test's environment.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const APP_DATABASE_URL = process.env['APP_DATABASE_URL'];
if (!APP_DATABASE_URL) {
  throw new Error(
    'APP_DATABASE_URL is not set. These are real-Postgres RLS security tests, not unit ' +
      'tests - they need the same connection string PrismaService uses at runtime ' +
      '(see .env.example) and a reachable Postgres with migrations applied.',
  );
}

/**
 * Connects as the restricted `plexo_app` role - the SAME role PrismaService
 * connects as at runtime (see prisma.service.ts), never the admin/migration
 * role from DATABASE_URL. plexo_app is NOSUPERUSER NOBYPASSRLS (see
 * docker/postgres-init/01-init-roles.sql) - if these tests somehow connected
 * as an RLS-bypassing role instead, every leak test below would pass for the
 * wrong reason (nothing would ever be filtered), silently defeating the
 * whole suite. That's the one thing this file must never get wrong.
 */
export const appPool = new Pool({ connectionString: APP_DATABASE_URL });

/**
 * Opens one transaction and sets `app.tenant_id` on it via set_config() -
 * byte-for-byte the same mechanism withTenantContext() (../tenant-context.ts)
 * uses for every real request (`SELECT set_config('app.tenant_id', $1, true)`,
 * `true` = local to this transaction). These tests must prove Postgres
 * itself enforces isolation under the exact session state the app produces
 * in production, not a reimplementation that could quietly drift from it.
 *
 * Commits on success, rolls back on throw (so a test asserting that a write
 * is REJECTED leaves no residue - the rejection itself already aborted the
 * transaction, this just makes that explicit and uniform for every caller).
 */
export async function asTenant<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Generic single-row insert, `id` always explicit: none of this schema's
 * tables have a database-level default for `id` (Prisma's `@default(uuid())`
 * is resolved client-side by Prisma, never by Postgres itself - confirmed by
 * inspecting information_schema.columns before writing this file), so a raw
 * SQL insert that bypasses Prisma must always supply one. Every other
 * column with a real DB default (createdAt/date -> CURRENT_TIMESTAMP) can be
 * omitted from `values` and is left to Postgres.
 */
export async function insertRow(
  client: PoolClient,
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<string> {
  const row: Record<string, unknown> = { id, ...values };
  const columns = Object.keys(row);
  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const sql = `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(', ')})`;
  await client.query(
    sql,
    columns.map((c) => row[c]),
  );
  return id;
}

export function newId(): string {
  return randomUUID();
}

/**
 * The list this whole suite is built to protect: every table with a
 * required (NOT NULL) `tenantId` column, read live from Postgres itself via
 * information_schema - not hand-maintained, not parsed out of schema.prisma
 * text. Two tables deliberately do NOT show up here despite being
 * tenant-related, and neither is a gap:
 *
 *  - `plans`: a global commercial catalog (Basic/Silver/Diamond/...) shared
 *    by every tenant - has no tenantId column and no RLS at all, on
 *    purpose (see the model's own doc comment in schema.prisma). Excluded
 *    structurally by this query, not by a name in a skip-list.
 *  - `tenants`: has RLS, but keyed on its own `id` column
 *    (`id = current_setting('app.tenant_id')`), not on a `tenantId`
 *    column - it IS the tenant, not a tenant-scoped child table. A
 *    `tenantId`-column query correctly leaves it out; see
 *    cross-tenant-fk.rls-spec.ts for where it's exercised directly instead.
 *
 * NOT NULL is the signal, not "has a column named tenantId" alone: one
 * table (`system_error_log`) has an optional, informational `tenantId` with
 * deliberately no RLS (writes happen before any tenant context exists - see
 * its own doc comment) - a nullable tenantId can never appear in a
 * `tenantId = current_setting(...)` policy predicate the way a required one
 * can, so excluding it here is the same distinction Postgres itself would
 * need to draw.
 */
export async function getTenantScopedTables(client: PoolClient): Promise<string[]> {
  const { rows } = await client.query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = 'tenantId'
        AND is_nullable = 'NO'
      ORDER BY table_name`,
  );
  return rows.map((r) => r.table_name);
}

export interface TableRlsState {
  table: string;
  exists: boolean;
  rowSecurityEnabled: boolean;
  rowSecurityForced: boolean;
  policyCount: number;
}

/** Live RLS state per table, straight from pg_class/pg_policies - the
 * actual deployed guarantee, independent of what schema.prisma or any
 * migration file claims. */
export async function getRlsState(client: PoolClient, tables: string[]): Promise<TableRlsState[]> {
  if (tables.length === 0) {
    return [];
  }
  const { rows: classRows } = await client.query<{
    relname: string;
    relrowsecurity: boolean;
    relforcerowsecurity: boolean;
  }>(
    `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
      WHERE relname = ANY($1) AND relnamespace = 'public'::regnamespace`,
    [tables],
  );
  const { rows: policyRows } = await client.query<{ tablename: string; n: string }>(
    `SELECT tablename, count(*)::text AS n
       FROM pg_policies
      WHERE tablename = ANY($1)
      GROUP BY tablename`,
    [tables],
  );
  const classByName = new Map(classRows.map((r) => [r.relname, r]));
  const policyByName = new Map(policyRows.map((r) => [r.tablename, Number(r.n)]));

  return tables.map((table) => {
    const info = classByName.get(table);
    return {
      table,
      exists: !!info,
      rowSecurityEnabled: info?.relrowsecurity ?? false,
      rowSecurityForced: info?.relforcerowsecurity ?? false,
      policyCount: policyByName.get(table) ?? 0,
    };
  });
}
