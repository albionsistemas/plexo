import { Prisma } from '@plexo/database';

/** Ancho fijo alfanumérico: se completa con espacios a la derecha (no con
 * ceros) y se trunca si excede el ancho - ver ANEXO I, "Tipo de dato" 3
 * (Alfanumérico) del diseño de registro Libro de IVA Digital (RG 4597). */
export function padAlfa(value: string, len: number): string {
  return value.padEnd(len, ' ').slice(0, len);
}

/** Ancho fijo numérico: ceros a la izquierda ("Completar con ceros a
 * izquierda", observación repetida en varios campos del diseño de
 * registro) - se trunca por la izquierda si excede el ancho (no debería
 * pasar con los datos reales de esta app). */
export function padNum(value: string, len: number): string {
  return value.padStart(len, '0').slice(-len);
}

/** "13 enteros 2 decimales sin punto decimal" - el importe multiplicado
 * por 100, redondeado, sin signo (cada comprobante es su propia fila con
 * su propio importe natural positivo - a diferencia de la grilla en
 * pantalla, acá una Nota de Crédito NO se resta con un importe negativo,
 * ver CitiExportService). */
export function formatAmount(value: Prisma.Decimal | number, len = 15): string {
  const cents = Math.round(Math.abs(Number(value)) * 100);
  return padNum(String(cents), len);
}

/** "4 enteros 6 decimales sin punto decimal" = 10 caracteres. */
export function formatExchangeRate(value: Prisma.Decimal | number): string {
  const scaled = Math.round(Math.abs(Number(value)) * 1_000_000);
  return padNum(String(scaled), 10);
}

/** AAAAMMDD - fechas de UTC (mismo criterio que el resto de la app para
 * fechas sin componente horario relevante), 8 espacios si no hay fecha. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return ' '.repeat(8);
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}
