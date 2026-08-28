import { Injectable } from '@nestjs/common';
import type { BnaExchangeRatePort, BnaOfficialRate } from './bna-exchange-rate.port.js';

/**
 * Wired in sólo cuando BNA_EXCHANGE_RATE_STUB=true (ver invoicing.module.ts)
 * - destraba probar el botón "Sincronizar con Banco Nación" en desarrollo
 * local sin depender de la red de esta máquina. Determinístico (no random)
 * para que dos syncs seguidos en la misma sesión de test no den valores
 * distintos por las dudas - mismo criterio que StubAfipPadronService en
 * @plexo/companies.
 */
@Injectable()
export class StubBnaExchangeRateService implements BnaExchangeRatePort {
  async getOfficialUsdRate(): Promise<BnaOfficialRate> {
    return { buy: 1000, sell: 1050, asOf: new Date() };
  }
}
