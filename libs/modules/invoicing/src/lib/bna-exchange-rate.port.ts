export interface BnaOfficialRate {
  buy: number;
  sell: number;
  asOf: Date;
}

/**
 * Cotización oficial del dólar (Banco Nación) para el sync automático de
 * "Monedas y Cotizaciones" en Preferencias. No existe un endpoint JSON
 * propio de bna.com.ar - RealBnaExchangeRateService pega contra un proxy
 * público que sí replica ese dato (ver ese archivo). Puerto separado del
 * dato en sí para poder mockearlo en dev/test sin depender de la red, mismo
 * criterio que AfipPadronPort en @plexo/companies.
 */
export interface BnaExchangeRatePort {
  getOfficialUsdRate(): Promise<BnaOfficialRate>;
}

export const BNA_EXCHANGE_RATE = Symbol('BNA_EXCHANGE_RATE');

export class BnaExchangeRateLookupError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'BnaExchangeRateLookupError';
  }
}
