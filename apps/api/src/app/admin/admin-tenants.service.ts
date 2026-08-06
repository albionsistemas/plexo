import { Injectable, Logger } from '@nestjs/common';
import { getTenantDb, PrismaService, withTenantContext, type TenantStatus } from '@plexo/database';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { AuthService } from '../auth/auth.service.js';
import { TenantProvisioningService } from '../auth/tenant-provisioning.service.js';
import type { CreateTenantDto } from './dto/create-tenant.dto.js';

export interface CreatedTenant {
  tenantId: string;
  ownerEmail: string;
  tempPassword: string;
}

export interface TenantSummary {
  id: string;
  name: string;
  status: TenantStatus;
  createdAt: Date;
  activeUsers: number;
  invoicesThisMonth: number;
  planKey: string | null;
  subscriptionStatus: string | null;
}

export interface TenantUserSummary {
  id: string;
  email: string;
  name: string | null;
  role: string;
}

/** Rango del mes calendario actual en UTC - mismo criterio que
 * defaultDateRange() en reports-sales.service.ts, reescrito acá porque esa
 * función vive en una lib de reportes tenant-scoped y este uso es
 * cross-tenant (un solo "ahora" para el barrido completo, no por request). */
function currentMonthRangeUtc(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { from, to };
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
  private readonly logger = new Logger(AdminTenantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  /** Un withTenantContext por tenant (list_tenant_ids(), mismo recipe que
   * ReceivablesSchedulerService/SubscriptionsSchedulerService) - un tenant
   * con datos corruptos/una falla transitoria no debe tumbar el panel
   * entero, sólo faltar en la lista con un log. */
  async listTenants(): Promise<TenantSummary[]> {
    const tenants = await this.prisma.$queryRaw<{ id: string }[]>`SELECT id FROM list_tenant_ids() AS id`;
    const { from, to } = currentMonthRangeUtc();

    const summaries: TenantSummary[] = [];
    for (const { id: tenantId } of tenants) {
      try {
        const summary = await withTenantContext(this.prisma, tenantId, async () => {
          const db = getTenantDb();
          const [tenant, activeUsers, invoicesThisMonth, subscription] = await Promise.all([
            db.tenant.findUniqueOrThrow({ where: { id: tenantId } }),
            db.user.count(),
            db.invoice.count({ where: { issueDate: { gte: from, lt: to } } }),
            db.tenantSubscription.findUnique({ where: { tenantId }, include: { plan: true } }),
          ]);

          return {
            id: tenant.id,
            name: tenant.name,
            status: tenant.status,
            createdAt: tenant.createdAt,
            activeUsers,
            invoicesThisMonth,
            planKey: subscription?.plan.key ?? null,
            subscriptionStatus: subscription?.status ?? null,
          };
        });
        summaries.push(summary);
      } catch (err) {
        this.logger.error(`Failed to load tenant summary for ${tenantId}: ${(err as Error).message}`);
      }
    }

    return summaries;
  }

  /** Para el selector de "a quién impersonar" en el frontend, cuando un
   * tenant tiene más de un usuario (ver la sección de impersonación del
   * plan aprobado). */
  async listTenantUsers(tenantId: string): Promise<TenantUserSummary[]> {
    return withTenantContext(this.prisma, tenantId, async () => {
      const users = await getTenantDb().user.findMany({
        select: { id: true, email: true, name: true, role: true },
        orderBy: { email: 'asc' },
      });
      return users;
    });
  }

  async updateTenantStatus(tenantId: string, status: TenantStatus): Promise<void> {
    await withTenantContext(this.prisma, tenantId, () =>
      getTenantDb().tenant.update({ where: { id: tenantId }, data: { status } }),
    );
  }

  /** Delega en AuthService.impersonate() - ver ese método para el detalle
   * del token corto y el registro en el activity log del tenant destino. */
  impersonate(tenantId: string, userId: string, admin: { id: string; email: string }) {
    return this.authService.impersonate(tenantId, userId, admin);
  }

  async createTenant(dto: CreateTenantDto): Promise<CreatedTenant> {
    const tenantId = randomUUID();
    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    // autoVerifyEmail: true - un tenant dado de alta acá lo crea el
    // operador de plataforma a mano, no hace falta el gate de OTP que sí
    // aplica al signup público (ver SignupService).
    await this.tenantProvisioningService.provision({
      tenantId,
      name: dto.name,
      taxId: dto.taxId,
      ownerEmail: dto.ownerEmail,
      ownerName: dto.ownerName,
      passwordHash,
      mustChangePassword: true,
      autoVerifyEmail: true,
      planKey: dto.planKey,
    });

    return { tenantId, ownerEmail: dto.ownerEmail, tempPassword };
  }
}
