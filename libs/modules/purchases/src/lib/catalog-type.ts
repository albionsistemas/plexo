import { BadRequestException } from '@nestjs/common';

/**
 * The 3 catalogs share an identical shape ({ id, tenantId, name, active }),
 * so one generic service handles all of them instead of tripling nearly
 * identical CRUD code - same idiom the repo already uses for
 * UserActivityLog.entityType/@AuditEntity (a plain string picking which
 * getTenantDb() delegate to use, not a per-entity class).
 */
export const CATALOG_ROUTE_TYPES = ['transport-modes', 'payment-terms', 'delivery-times'] as const;
export type CatalogRouteType = (typeof CATALOG_ROUTE_TYPES)[number];

export function assertCatalogRouteType(routeType: string): CatalogRouteType {
  if (!(CATALOG_ROUTE_TYPES as readonly string[]).includes(routeType)) {
    throw new BadRequestException(
      `Unknown catalog type "${routeType}" - expected one of ${CATALOG_ROUTE_TYPES.join(', ')}`,
    );
  }
  return routeType as CatalogRouteType;
}
