import type { DocumentLetter } from '@plexo/database';

/** Tabla "Tipo de Comprobante" de ARCA (Libro-IVA-Digital-Tablas-del-
 * Sistema.pdf) - mismos códigos que `CBTE_TIPO` en
 * libs/modules/invoicing/src/lib/afip-wsfe-client.ts (WSFE), acá con 3
 * dígitos y cero a la izquierda en vez de numéricos sin padding.
 * Duplicado a propósito - un lib module nunca importa el de otro, mismo
 * criterio ya aplicado en esta sesión (ver QuoteService.resolveLineTax). */
export const CBTE_TIPO_FACTURA: Record<DocumentLetter, string> = {
  A: '001',
  B: '006',
  C: '011',
  M: '051',
};

export const CBTE_TIPO_NOTA_CREDITO: Record<DocumentLetter, string> = {
  A: '003',
  B: '008',
  C: '013',
  M: '053',
};

/** Tabla "Alícuotas del IVA" de ARCA - superset de las 4 que hoy soporta
 * `IVA_ALICUOTA_ID` en WSFE (ese sólo cubre 0/10.5/21/27, acá se agregan
 * 5%/2,5% que `VatRateSelect` ya expone en Facturación/Cotizaciones). */
const ALICUOTA_CODES: { rate: number; code: string }[] = [
  { rate: 0, code: '0003' },
  { rate: 10.5, code: '0004' },
  { rate: 21, code: '0005' },
  { rate: 27, code: '0006' },
  { rate: 5, code: '0008' },
  { rate: 2.5, code: '0009' },
];

/** null si la tasa no es una de las 6 alícuotas reales argentinas - no se
 * inventa un código para una tasa fuera de catálogo (ver
 * CitiExportService, esas líneas simplemente no generan fila). */
export function resolveAlicuotaCode(rate: number): string | null {
  return ALICUOTA_CODES.find((r) => Math.abs(r.rate - rate) < 0.01)?.code ?? null;
}

/** Tabla "Código de Moneda" - mismo `MonId` que WSFE (sólo ARS/USD, ver
 * el comentario original en afip-wsfe-client.ts sobre por qué el resto no
 * está mapeado). */
export const MON_ID: Record<string, string> = { ARS: 'PES', USD: 'DOL' };

export function resolveMonId(currencyCode: string): string {
  return MON_ID[currencyCode.toUpperCase()] ?? 'PES';
}

/** Tabla "Tipo de Documento" - mismo `DocTipo` que WSFE (80=CUIT,
 * 99=Sin identificar), ver resolveDocTipoNro en afip-wsfe-client.ts. */
export function resolveDocTipo(taxId: string | null): { docTipo: string; docNro: string } {
  if (!taxId) return { docTipo: '99', docNro: '0' };
  return { docTipo: '80', docNro: taxId.replace(/\D/g, '') };
}
