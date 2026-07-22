import { Injectable, Logger } from '@nestjs/common';
import { XMLParser } from 'fast-xml-parser';
import { AfipLookupError, type AfipPadronData, type AfipPadronPort } from './afip-padron.port.js';
import { AfipWsaaClient, type AfipCredentials } from './afip-wsaa-client.js';

const PADRON_SERVICE = 'ws_sr_padron_a13';

const PADRON_URL: Record<AfipCredentials['env'], string> = {
  homologacion: 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13',
  produccion: 'https://aws.afip.gov.ar/sr-padron/webservices/personaServiceA13',
};

const xmlParser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });

interface AfipImpuesto {
  idImpuesto?: string | number;
  estado?: string;
}

interface AfipPersona {
  tipoPersona?: string;
  razonSocial?: string;
  nombre?: string;
  apellido?: string;
  domicilioFiscal?: { direccion?: string; localidad?: string; provincia?: string };
  datosGenerales?: AfipPersona;
  datosRegimenGeneral?: { impuesto?: AfipImpuesto | AfipImpuesto[] };
  datosMonotributo?: { categoriaMonotributo?: string | { descripcionCategoria?: string } };
}

/**
 * Real ws_sr_padron_a13 lookup. Needs an AFIP digital certificate
 * authorized for the "Padrón" service (Administrador de Relaciones de
 * Clave Fiscal) - see AFIP_CERT_PATH/AFIP_KEY_PATH/AFIP_CUIT_REPRESENTADA
 * in .env.example. Falls back to StubAfipPadronService when those aren't
 * set (see companies.module.ts).
 */
@Injectable()
export class RealAfipPadronService implements AfipPadronPort {
  private readonly logger = new Logger(RealAfipPadronService.name);
  private readonly wsaa: AfipWsaaClient;
  private readonly env: AfipCredentials['env'];

  constructor(
    credentials: AfipCredentials,
    private readonly cuitRepresentada: string,
  ) {
    this.wsaa = new AfipWsaaClient(credentials);
    this.env = credentials.env;
  }

  async lookup(cuit: string): Promise<AfipPadronData | null> {
    let ticket;
    try {
      ticket = await this.wsaa.getTicket(PADRON_SERVICE);
    } catch (err) {
      throw new AfipLookupError('No se pudo autenticar contra AFIP (WSAA)', err);
    }

    const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:a13="http://a13.soap.ws.server.puc.sr/">
  <soapenv:Header/>
  <soapenv:Body>
    <a13:getPersona>
      <token>${ticket.token}</token>
      <sign>${ticket.sign}</sign>
      <cuitRepresentada>${this.cuitRepresentada}</cuitRepresentada>
      <idPersona>${cuit}</idPersona>
    </a13:getPersona>
  </soapenv:Body>
</soapenv:Envelope>`;

    let responseText: string;
    try {
      const response = await fetch(PADRON_URL[this.env], {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '' },
        body: soapBody,
      });
      responseText = await response.text();
      if (!response.ok) {
        throw new Error(`AFIP respondió ${response.status}`);
      }
    } catch (err) {
      throw new AfipLookupError('No se pudo consultar el padrón de AFIP', err);
    }

    const faultMatch = responseText.match(/<faultstring>(.*?)<\/faultstring>/);
    if (faultMatch) {
      // A CUIT with no padrón record surfaces as a SOAP fault too, not
      // just a missing <persona> - treat it the same as "not found".
      if (/no existe|no se encuentra|sin datos/i.test(faultMatch[1])) {
        return null;
      }
      throw new AfipLookupError(faultMatch[1]);
    }

    const parsed = xmlParser.parse(responseText);
    const persona: AfipPersona | undefined =
      parsed?.Envelope?.Body?.getPersonaResponse?.personaReturn?.persona;
    if (!persona) {
      return null;
    }

    this.logger.log(`AFIP padrón lookup for ${cuit} resolved`);
    return this.mapPersona(cuit, persona);
  }

  private mapPersona(cuit: string, persona: AfipPersona): AfipPadronData {
    const general = persona.datosGenerales ?? persona;
    const personType: 'FISICA' | 'JURIDICA' = general.tipoPersona === 'FISICA' ? 'FISICA' : 'JURIDICA';
    const name =
      general.razonSocial || [general.nombre, general.apellido].filter(Boolean).join(' ') || cuit;

    const domicilio = general.domicilioFiscal;
    const fiscalAddress = domicilio
      ? [domicilio.direccion, domicilio.localidad, domicilio.provincia].filter(Boolean).join(', ')
      : '';

    return {
      cuit,
      personType,
      name,
      taxCondition: this.inferTaxCondition(persona),
      fiscalAddress: fiscalAddress || null,
    };
  }

  /** Best-effort label, not a closed enum - AFIP's own tax-condition
   * categories change over time and this is only ever displayed to the
   * user, never persisted or matched against elsewhere. */
  private inferTaxCondition(persona: AfipPersona): string | null {
    const impuestos = persona.datosRegimenGeneral?.impuesto;
    const list = Array.isArray(impuestos) ? impuestos : impuestos ? [impuestos] : [];
    const ivaInscripto = list.some(
      (imp) => String(imp.idImpuesto) === '30' && imp.estado === 'ACTIVO',
    );
    if (ivaInscripto) {
      return 'Responsable Inscripto';
    }

    const monotributo = persona.datosMonotributo;
    if (monotributo) {
      const categoria =
        typeof monotributo.categoriaMonotributo === 'string'
          ? monotributo.categoriaMonotributo
          : monotributo.categoriaMonotributo?.descripcionCategoria;
      return categoria ? `Monotributo (${categoria})` : 'Monotributo';
    }

    return null;
  }
}
