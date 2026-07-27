import { Injectable, NotFoundException } from '@nestjs/common';
import { getTenantDb, getTenantId } from '@plexo/database';
import { assertCatalogRouteType } from './catalog-type.js';
import type { CreateCatalogItemDto } from './dto/create-catalog-item.dto.js';
import type { UpdateCatalogItemDto } from './dto/update-catalog-item.dto.js';

export interface CatalogItemView {
  id: string;
  name: string;
  active: boolean;
}

/**
 * One service for the 3 near-identical catalogs (transporte/forma de
 * pago/plazo de entrega) instead of tripling this CRUD. Each method
 * switches on the route type and calls the concretely-typed Prisma
 * delegate directly in every branch - a shared helper returning "the
 * delegate" as one value doesn't type-check, since TS can't merge 3
 * delegates' incompatible call signatures into one callable union.
 */
@Injectable()
export class PurchaseCatalogsService {
  async list(routeType: string, includeInactive: boolean): Promise<CatalogItemView[]> {
    const type = assertCatalogRouteType(routeType);
    const db = getTenantDb();
    const tenantId = getTenantId();
    const where = includeInactive ? { tenantId } : { tenantId, active: true };
    const orderBy = { name: 'asc' } as const;

    switch (type) {
      case 'transport-modes':
        return db.transportMode.findMany({ where, orderBy });
      case 'payment-terms':
        return db.paymentTerm.findMany({ where, orderBy });
      case 'delivery-times':
        return db.deliveryTime.findMany({ where, orderBy });
    }
  }

  async create(routeType: string, dto: CreateCatalogItemDto): Promise<CatalogItemView> {
    const type = assertCatalogRouteType(routeType);
    const db = getTenantDb();
    const data = { tenantId: getTenantId(), name: dto.name };

    switch (type) {
      case 'transport-modes':
        return db.transportMode.create({ data });
      case 'payment-terms':
        return db.paymentTerm.create({ data });
      case 'delivery-times':
        return db.deliveryTime.create({ data });
    }
  }

  async update(routeType: string, id: string, dto: UpdateCatalogItemDto): Promise<CatalogItemView> {
    const type = assertCatalogRouteType(routeType);
    const db = getTenantDb();
    const data = { name: dto.name, active: dto.active };

    switch (type) {
      case 'transport-modes': {
        const existing = await db.transportMode.findUnique({ where: { id } });
        if (!existing) {
          throw new NotFoundException('Catalog item not found');
        }
        return db.transportMode.update({ where: { id }, data });
      }
      case 'payment-terms': {
        const existing = await db.paymentTerm.findUnique({ where: { id } });
        if (!existing) {
          throw new NotFoundException('Catalog item not found');
        }
        return db.paymentTerm.update({ where: { id }, data });
      }
      case 'delivery-times': {
        const existing = await db.deliveryTime.findUnique({ where: { id } });
        if (!existing) {
          throw new NotFoundException('Catalog item not found');
        }
        return db.deliveryTime.update({ where: { id }, data });
      }
    }
  }
}
