import { SetMetadata } from '@nestjs/common';

export const AUDIT_ENTITY_KEY = 'auditEntity';

export interface AuditEntityMeta {
  /** Prisma model name on getTenantDb(), e.g. "company". */
  modelName: string;
  /** Route param holding the entity id (e.g. 'id' for PATCH :id). null for
   * tenant-singleton entities with no id in the route (e.g. TenantSettings)
   * - the interceptor then looks the row up by { tenantId } instead. */
  idParam: string | null;
  /** Field names read off the entity, joined with a space, to build the
   * human label shown in the friendly own-activity view and the admin
   * table (e.g. ['name'] for Company). Omitted for entities with no
   * natural display name. */
  labelFields?: string[];
}

/**
 * Opt-in per route, mirroring @Roles/RolesGuard exactly (see
 * roles.decorator.ts) - ActivityLogInterceptor reads this via Reflector to
 * fetch a before/after diff for THIS route only. Routes without it keep
 * logging exactly as before this decorator existed (plain "METHOD /url",
 * no diff) - this is additive, not a new requirement on every mutation.
 */
export const AuditEntity = (
  modelName: string,
  options: { idParam?: string | null; labelFields?: string[] } = {},
) =>
  SetMetadata(AUDIT_ENTITY_KEY, {
    modelName,
    idParam: options.idParam === undefined ? 'id' : options.idParam,
    labelFields: options.labelFields,
  } satisfies AuditEntityMeta);
