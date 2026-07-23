/** Always excluded from any diff, regardless of entity - technical/noise
 * columns no audit reader cares about. Fixed and global on purpose: a
 * per-entity allowlist would reintroduce the per-endpoint maintenance the
 * @AuditEntity decorator is trying to avoid. */
const AUDIT_FIELD_DENYLIST = new Set([
  'id',
  'tenantId',
  'createdAt',
  'updatedAt',
  'passwordHash',
  'resendDomainId',
]);

/** Defense-in-depth: excludes any field matching this regardless of the
 * denylist above, so a future entity with e.g. an `apiSecret` column never
 * leaks into a diff just because nobody remembered to denylist it by name. */
const SENSITIVE_FIELD_PATTERN = /password|secret|token|hash/i;

function auditableKeys(entity: Record<string, unknown>): string[] {
  return Object.keys(entity).filter(
    (key) => !AUDIT_FIELD_DENYLIST.has(key) && !SENSITIVE_FIELD_PATTERN.test(key),
  );
}

/** Prisma.Decimal/Date values are never === across two separate reads even
 * when equal in value - comparing their string forms avoids false
 * positives in the diff. */
function valuesEqual(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '');
}

export type EntityDiff = Record<string, { from: unknown; to: unknown }>;

/**
 * before === null means CREATE (or a singleton's first-ever upsert) -
 * every field on `after` is emitted as {from: null, to: value}. after ===
 * null/undefined means DELETE - every field on `before` is emitted as
 * {from: value, to: null}. Field set comes from whichever of the two is
 * non-null, so relation arrays (e.g. Company.roles) never leak in - a
 * plain findUnique() with no `include` never has those keys.
 */
export function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): EntityDiff {
  const source = before ?? after;
  if (!source) return {};

  const diff: EntityDiff = {};
  for (const key of auditableKeys(source)) {
    const fromValue = before?.[key] ?? null;
    const toValue = after?.[key] ?? null;
    if (!valuesEqual(fromValue, toValue)) {
      diff[key] = { from: fromValue, to: toValue };
    }
  }
  return diff;
}

export function buildEntityLabel(
  entity: Record<string, unknown> | null | undefined,
  labelFields?: string[],
): string | undefined {
  if (!entity || !labelFields || labelFields.length === 0) return undefined;
  const label = labelFields
    .map((field) => entity[field])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
  return label || undefined;
}
