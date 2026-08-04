import { Injectable } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { SubscriptionService } from '@plexo/subscriptions';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import type { CreateTenantDto } from './dto/create-tenant.dto.js';

export interface CreatedTenant {
  tenantId: string;
  ownerEmail: string;
  tempPassword: string;
}

/**
 * Alta de tenant para el operador de plataforma (ver PlatformAdminGuard) -
 * reemplaza el proceso manual (seed script / SQL directo) que era el único
 * camino hasta ahora. Vive en apps/api (no en una lib) porque, a diferencia
 * de todo lo demás en este código, esta operación NO puede quedar scopeada
 * al tenant de quien la ejecuta: inyecta PrismaService crudo, nunca
 * getTenantDb().
 *
 * `Tenant` SÍ tiene RLS (policy tenant_self_only, keyed por "id" - ver
 * 20260723000001_row_level_security) - por eso hace falta abrir un
 * withTenantContext propio para el tenant recién generado antes de poder
 * insertarlo, no es opcional. Como este request YA viene envuelto en una
 * transacción para el tenant del propio admin (TenantContextInterceptor,
 * global), este bloque abre una segunda transacción/conexión independiente
 * en el mismo pool - aceptable para un endpoint de un solo operador, de
 * baja frecuencia.
 */
@Injectable()
export class AdminTenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
  ) {}

  async createTenant(dto: CreateTenantDto): Promise<CreatedTenant> {
    const tenantId = randomUUID();
    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await withTenantContext(this.prisma, tenantId, async () => {
      const db = getTenantDb();
      await db.tenant.create({ data: { id: tenantId, name: dto.name, taxId: dto.taxId } });
      await db.user.create({
        data: {
          tenantId,
          email: dto.ownerEmail,
          name: dto.ownerName,
          passwordHash,
          role: 'OWNER',
          mustChangePassword: true,
        },
      });
      // Corre DENTRO de este callback a propósito: acá getTenantId() ya
      // resuelve al tenant recién creado (contexto anidado), que es lo que
      // TenantSubscription (tenant-scoped, con RLS) necesita para el insert.
      await this.subscriptionService.startTrial(dto.planKey);
    });

    return { tenantId, ownerEmail: dto.ownerEmail, tempPassword };
  }
}
