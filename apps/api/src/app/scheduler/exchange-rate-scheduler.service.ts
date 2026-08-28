import { BadRequestException, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getTenantDb, PrismaService, withTenantContext } from '@plexo/database';
import { BNA_EXCHANGE_RATE, type BnaExchangeRatePort, InvoicingService } from '@plexo/invoicing';
import { CronJob, CronTime } from 'cron';

const BNA_SYNC_JOB_NAME = 'bna-sync';
// Fila única de PlatformSettings - ver ese modelo en schema.prisma.
const PLATFORM_SETTINGS_ID = 'global';

function cronExpressionForHour(hour: number): string {
  return `0 ${hour} * * *`;
}

export interface BnaSyncSettings {
  bnaSyncEnabled: boolean;
  bnaSyncHour: number;
}

export interface BnaSyncResult {
  synced: number;
  skipped: number;
}

/**
 * Sweep diario configurable desde Admin → Cotizaciones USD (horario +
 * on/off, ver AdminBnaSyncController) - a diferencia de los demás
 * schedulers de este archivo (ReceivablesSchedulerService, etc, todos con
 * @Cron estático), este usa SchedulerRegistry + CronJob dinámico
 * (paquete `cron`, el mismo que usa @nestjs/schedule por dentro) porque el
 * horario tiene que poder cambiar en caliente sin reiniciar el proceso -
 * job.setTime() lo permite, @Cron no.
 *
 * La cotización en sí es la MISMA para todos los tenants (dato de mercado,
 * no tenant-specific) - se pide UNA sola vez por sweep (no una llamada de
 * red por tenant) y se persiste en cada tenant que ya tenga la moneda USD
 * configurada (ver InvoicingService.recordExchangeRate) - el resto
 * simplemente no usa dólares todavía, no es un error.
 */
@Injectable()
export class ExchangeRateSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(ExchangeRateSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicingService: InvoicingService,
    private readonly schedulerRegistry: SchedulerRegistry,
    @Inject(BNA_EXCHANGE_RATE) private readonly bnaExchangeRate: BnaExchangeRatePort,
  ) {}

  async onModuleInit(): Promise<void> {
    const settings = await this.getSettings();
    const job = new CronJob(cronExpressionForHour(settings.bnaSyncHour), () => {
      void this.runScheduledSync();
    });
    this.schedulerRegistry.addCronJob(BNA_SYNC_JOB_NAME, job);
    job.start();
  }

  /** Get-or-create defensivo - la migración ya siembra la única fila, esto
   * es sólo una red de seguridad si algún día se resetea la tabla a mano. */
  async getSettings(): Promise<BnaSyncSettings> {
    const existing = await this.prisma.platformSettings.findUnique({
      where: { id: PLATFORM_SETTINGS_ID },
    });
    if (existing) {
      return existing;
    }
    return this.prisma.platformSettings.create({ data: { id: PLATFORM_SETTINGS_ID } });
  }

  /** "Cotizaciones USD" en Admin - togglear on/off y/o cambiar el horario.
   * Cambiar el horario reprograma el CronJob ya registrado en caliente
   * (setTime), no hace falta reiniciar el proceso. */
  async updateSettings(patch: { enabled?: boolean; hour?: number }): Promise<BnaSyncSettings> {
    if (patch.hour !== undefined && (patch.hour < 0 || patch.hour > 23)) {
      throw new BadRequestException('La hora debe estar entre 0 y 23');
    }
    const updated = await this.prisma.platformSettings.upsert({
      where: { id: PLATFORM_SETTINGS_ID },
      create: {
        id: PLATFORM_SETTINGS_ID,
        ...(patch.enabled !== undefined ? { bnaSyncEnabled: patch.enabled } : {}),
        ...(patch.hour !== undefined ? { bnaSyncHour: patch.hour } : {}),
      },
      update: {
        ...(patch.enabled !== undefined ? { bnaSyncEnabled: patch.enabled } : {}),
        ...(patch.hour !== undefined ? { bnaSyncHour: patch.hour } : {}),
      },
    });
    if (patch.hour !== undefined) {
      this.schedulerRegistry
        .getCronJob(BNA_SYNC_JOB_NAME)
        .setTime(new CronTime(cronExpressionForHour(patch.hour)));
    }
    return updated;
  }

  /** Wrapper del tick automático - respeta el toggle on/off. syncBnaRateForAllTenants()
   * en sí NO lo revisa, para que "Sincronizar ahora" (disparo manual
   * explícito) siempre corra sin importar si el sweep automático está
   * deshabilitado. */
  private async runScheduledSync(): Promise<void> {
    const settings = await this.getSettings();
    if (!settings.bnaSyncEnabled) {
      this.logger.log('BNA sync deshabilitado, se salta el sweep programado');
      return;
    }
    try {
      await this.syncBnaRateForAllTenants();
    } catch (err) {
      // A diferencia de "Sincronizar ahora" (que sí debe propagar el error al
      // botón), el tick automático no tiene a quién devolvérselo - se loguea
      // y se espera al próximo tick, nunca una unhandled rejection.
      this.logger.error(`Scheduled BNA sync failed: ${(err as Error).message}`);
    }
  }

  /** "Sincronizar ahora" en Admin, y el tick automático (vía
   * runScheduledSync) - un tenant que falla no aborta el resto, mismo
   * patrón que ReceivablesSchedulerService. */
  async syncBnaRateForAllTenants(): Promise<BnaSyncResult> {
    const { sell } = await this.bnaExchangeRate.getOfficialUsdRate();

    const tenants = await this.prisma.$queryRaw<
      { id: string }[]
    >`SELECT id FROM list_tenant_ids() AS id`;

    let synced = 0;
    let skipped = 0;
    for (const { id: tenantId } of tenants) {
      try {
        await withTenantContext(this.prisma, tenantId, async () => {
          const usd = await getTenantDb().currency.findFirst({ where: { code: 'USD' } });
          if (!usd) {
            skipped += 1;
            return;
          }
          await this.invoicingService.recordExchangeRate({ currencyId: usd.id, rate: sell });
          synced += 1;
          this.logger.log(`Tenant ${tenantId}: cotización USD sincronizada con Banco Nación`);
        });
      } catch (err) {
        skipped += 1;
        this.logger.error(
          `Failed to sync BNA exchange rate for tenant ${tenantId}: ${(err as Error).message}`,
        );
      }
    }
    return { synced, skipped };
  }
}
