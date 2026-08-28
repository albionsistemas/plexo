import { Injectable, Logger } from '@nestjs/common';
import { BnaExchangeRateLookupError, type BnaExchangeRatePort, type BnaOfficialRate } from './bna-exchange-rate.port.js';

const DOLAR_OFICIAL_URL = 'https://dolarapi.com/v1/dolares/oficial';

interface DolarApiResponse {
  compra?: number;
  venta?: number;
  fechaActualizacion?: string;
}

/**
 * No hay un endpoint JSON propio de bna.com.ar para la cotización oficial -
 * dolarapi.com es un proxy público (sin key) que replica exactamente ese
 * dato ("Dólar Oficial", la referencia que en la práctica todos llaman
 * "cotización BNA"). Si el fetch falla o la respuesta no trae "venta", la
 * sincronización automática no tiene con qué completarse - se lanza un
 * error claro en vez de inventar un valor; la carga manual en Preferencias
 * sigue disponible siempre, sync o no.
 */
@Injectable()
export class RealBnaExchangeRateService implements BnaExchangeRatePort {
  private readonly logger = new Logger(RealBnaExchangeRateService.name);

  async getOfficialUsdRate(): Promise<BnaOfficialRate> {
    let response: Response;
    try {
      response = await fetch(DOLAR_OFICIAL_URL);
    } catch (err) {
      throw new BnaExchangeRateLookupError('No se pudo conectar con el servicio de cotización', err);
    }
    if (!response.ok) {
      throw new BnaExchangeRateLookupError(`El servicio de cotización respondió ${response.status}`);
    }

    const data = (await response.json()) as DolarApiResponse;
    if (typeof data.venta !== 'number' || typeof data.compra !== 'number') {
      throw new BnaExchangeRateLookupError('La respuesta del servicio de cotización no trae compra/venta');
    }

    this.logger.log(`Cotización oficial USD sincronizada: venta ${data.venta}`);
    return {
      buy: data.compra,
      sell: data.venta,
      asOf: data.fechaActualizacion ? new Date(data.fechaActualizacion) : new Date(),
    };
  }
}
