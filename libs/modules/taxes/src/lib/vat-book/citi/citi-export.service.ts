import { Injectable } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import { defaultRange } from '../vat-book.service.js';
import { formatAmount, formatDate, formatExchangeRate, padAlfa, padNum } from './citi-format.util.js';
import {
  CBTE_TIPO_FACTURA,
  CBTE_TIPO_NOTA_CREDITO,
  resolveAlicuotaCode,
  resolveDocTipo,
  resolveMonId,
} from './citi-tables.js';

export interface CitiFileResult {
  /** Ya con \r\n entre líneas, listo para escribir a disco/enviar. */
  content: string;
  /** Comprobantes que no se pudieron incluir - sólo aplica a Compras (0
   * en Ventas, donde Invoice/CreditNote siempre tienen documentLetter/
   * pointOfSale/number, son obligatorios desde que existen). Motivos:
   * falta ese mismo desglose en Compras (opcional ahí), moneda distinta
   * de ARS sin tipo de cambio propio, o una línea IVA_CREDITO sin
   * taxRate/netAmount (ver hasIncompleteIvaCredito). */
  skippedCount: number;
}

/** 'E' si TODAS las líneas gravables son EXENTO, 'N' si todas son
 * NO_GRAVADO, blanco si es una operación normal (incluida una mezcla de
 * gravado+exento - el neto exento ya va en su propio campo del header,
 * el código de operación sólo es para comprobantes enteramente de un
 * tipo especial, ver tabla "Códigos de Operación"). */
function resolveCodigoOperacion(kinds: string[]): string {
  const unique = new Set(kinds);
  if (unique.size === 1 && unique.has('EXENTO')) return 'E';
  if (unique.size === 1 && unique.has('NO_GRAVADO')) return 'N';
  return ' ';
}

/** Agrupa líneas GRAVADO por alícuota, sumando neto e impuesto - sólo
 * GRAVADO genera fila de alícuota (EXENTO/NO_GRAVADO no tienen alícuota
 * propia, van al campo "operaciones exentas"/"conceptos que no integran
 * el neto gravado" del header, mismo criterio que WSFE ya aplica). */
function groupByRate(lines: { netAmount: number; taxAmount: number; taxRate: number }[]) {
  const byRate = new Map<number, { netAmount: number; taxAmount: number }>();
  for (const line of lines) {
    const acc = byRate.get(line.taxRate) ?? { netAmount: 0, taxAmount: 0 };
    acc.netAmount += line.netAmount;
    acc.taxAmount += line.taxAmount;
    byRate.set(line.taxRate, acc);
  }
  return byRate;
}

/** true si el comprobante tiene alguna línea IVA_CREDITO sin el
 * desglose neto/alícuota (comprobante cargado antes de que Compras
 * tuviera IVA por línea) - ese comprobante se excluye entero de
 * getComprasCbte y getComprasAlicuotas en vez de dejar los dos
 * archivos inconsistentes entre sí (el crédito fiscal del CBTE no
 * cerraría contra la suma de sus propias filas en Alícuotas). */
function hasIncompleteIvaCredito(taxLines: { type: string; taxRate: unknown; netAmount: unknown }[]): boolean {
  return taxLines.some((l) => l.type === 'IVA_CREDITO' && (l.taxRate == null || l.netAmount == null));
}

@Injectable()
export class CitiExportService {
  /** LIBRO_IVA_DIGITAL_VENTAS_CBTE - una línea por Factura + una por Nota
   * de Crédito de venta, con importes naturales (no neteados, a
   * diferencia de VatBookService que sí netea la NC con signo negativo
   * para la grilla en pantalla). */
  async getVentasCbte(from?: string, to?: string): Promise<CitiFileResult> {
    const range = defaultRange(from, to);
    const db = getTenantDb();
    const lines: string[] = [];

    const invoices = await db.invoice.findMany({
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: { lines: true, currency: { select: { code: true } } },
      orderBy: { issueDate: 'asc' },
    });
    for (const invoice of invoices) {
      const { docTipo, docNro } = resolveDocTipo(invoice.customerTaxId);
      const exempt = invoice.lines.filter((l) => l.taxKind === 'EXENTO');
      const untaxed = invoice.lines.filter((l) => l.taxKind === 'NO_GRAVADO');
      const gravado = invoice.lines.filter((l) => l.taxKind === 'GRAVADO');
      const rateGroups = groupByRate(
        gravado.map((l) => ({
          netAmount: l.netAmount.toNumber(),
          taxAmount: l.lineTotal.sub(l.netAmount).toNumber(),
          taxRate: l.taxRate.toNumber(),
        })),
      );
      const exemptAmount = exempt.reduce((s, l) => s + l.netAmount.toNumber(), 0);
      const untaxedAmount = untaxed.reduce((s, l) => s + l.netAmount.toNumber(), 0);

      lines.push(
        [
          formatDate(invoice.issueDate),
          CBTE_TIPO_FACTURA[invoice.documentLetter],
          padNum(invoice.pointOfSale, 5),
          padNum(invoice.number, 20),
          padNum(invoice.number, 20),
          docTipo,
          padNum(docNro, 20),
          padAlfa(invoice.customerName, 30),
          formatAmount(invoice.total),
          formatAmount(untaxedAmount),
          formatAmount(0),
          formatAmount(exemptAmount),
          formatAmount(0),
          formatAmount(0),
          formatAmount(0),
          formatAmount(0),
          resolveMonId(invoice.currency.code),
          formatExchangeRate(invoice.exchangeRate),
          String(Math.min(rateGroups.size, 9)),
          resolveCodigoOperacion(invoice.lines.map((l) => l.taxKind)),
          formatAmount(0),
          formatDate(invoice.dueDate),
        ].join(''),
      );
    }

    const creditNotes = await db.creditNote.findMany({
      where: { issueDate: { gte: range.from, lte: range.to } },
      include: {
        lines: { include: { invoiceLine: { select: { taxKind: true, taxRate: true } } } },
        invoice: { select: { customerName: true, customerTaxId: true } },
        currency: { select: { code: true } },
      },
      orderBy: { issueDate: 'asc' },
    });
    for (const creditNote of creditNotes) {
      const { docTipo, docNro } = resolveDocTipo(creditNote.invoice.customerTaxId);
      const exempt = creditNote.lines.filter((l) => l.invoiceLine.taxKind === 'EXENTO');
      const untaxed = creditNote.lines.filter((l) => l.invoiceLine.taxKind === 'NO_GRAVADO');
      const gravado = creditNote.lines.filter((l) => l.invoiceLine.taxKind === 'GRAVADO');
      const rateGroups = groupByRate(
        gravado.map((l) => ({
          netAmount: l.netAmount.toNumber(),
          taxAmount: l.taxAmount.toNumber(),
          taxRate: l.invoiceLine.taxRate.toNumber(),
        })),
      );
      const exemptAmount = exempt.reduce((s, l) => s + l.netAmount.toNumber(), 0);
      const untaxedAmount = untaxed.reduce((s, l) => s + l.netAmount.toNumber(), 0);

      lines.push(
        [
          formatDate(creditNote.issueDate),
          CBTE_TIPO_NOTA_CREDITO[creditNote.documentLetter],
          padNum(creditNote.pointOfSale, 5),
          padNum(creditNote.number, 20),
          padNum(creditNote.number, 20),
          docTipo,
          padNum(docNro, 20),
          padAlfa(creditNote.invoice.customerName, 30),
          formatAmount(creditNote.total),
          formatAmount(untaxedAmount),
          formatAmount(0),
          formatAmount(exemptAmount),
          formatAmount(0),
          formatAmount(0),
          formatAmount(0),
          formatAmount(0),
          resolveMonId(creditNote.currency.code),
          formatExchangeRate(creditNote.exchangeRate),
          String(Math.min(rateGroups.size, 9)),
          resolveCodigoOperacion(creditNote.lines.map((l) => l.invoiceLine.taxKind)),
          formatAmount(0),
          formatDate(null),
        ].join(''),
      );
    }

    return { content: lines.join('\r\n'), skippedCount: 0 };
  }

  /** LIBRO_IVA_DIGITAL_VENTAS_ALICUOTAS - una línea por (comprobante,
   * alícuota GRAVADA). */
  async getVentasAlicuotas(from?: string, to?: string): Promise<CitiFileResult> {
    const range = defaultRange(from, to);
    const db = getTenantDb();
    const lines: string[] = [];

    const invoices = await db.invoice.findMany({
      where: { issueDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: { lines: true },
      orderBy: { issueDate: 'asc' },
    });
    for (const invoice of invoices) {
      const gravado = invoice.lines.filter((l) => l.taxKind === 'GRAVADO');
      const rateGroups = groupByRate(
        gravado.map((l) => ({
          netAmount: l.netAmount.toNumber(),
          taxAmount: l.lineTotal.sub(l.netAmount).toNumber(),
          taxRate: l.taxRate.toNumber(),
        })),
      );
      for (const [rate, amounts] of rateGroups) {
        const code = resolveAlicuotaCode(rate);
        if (!code) continue;
        lines.push(
          [
            CBTE_TIPO_FACTURA[invoice.documentLetter],
            padNum(invoice.pointOfSale, 5),
            padNum(invoice.number, 20),
            formatAmount(amounts.netAmount),
            code,
            formatAmount(amounts.taxAmount),
          ].join(''),
        );
      }
    }

    const creditNotes = await db.creditNote.findMany({
      where: { issueDate: { gte: range.from, lte: range.to } },
      include: { lines: { include: { invoiceLine: { select: { taxKind: true, taxRate: true } } } } },
      orderBy: { issueDate: 'asc' },
    });
    for (const creditNote of creditNotes) {
      const gravado = creditNote.lines.filter((l) => l.invoiceLine.taxKind === 'GRAVADO');
      const rateGroups = groupByRate(
        gravado.map((l) => ({
          netAmount: l.netAmount.toNumber(),
          taxAmount: l.taxAmount.toNumber(),
          taxRate: l.invoiceLine.taxRate.toNumber(),
        })),
      );
      for (const [rate, amounts] of rateGroups) {
        const code = resolveAlicuotaCode(rate);
        if (!code) continue;
        lines.push(
          [
            CBTE_TIPO_NOTA_CREDITO[creditNote.documentLetter],
            padNum(creditNote.pointOfSale, 5),
            padNum(creditNote.number, 20),
            formatAmount(amounts.netAmount),
            code,
            formatAmount(amounts.taxAmount),
          ].join(''),
        );
      }
    }

    return { content: lines.join('\r\n'), skippedCount: 0 };
  }

  /** LIBRO_IVA_DIGITAL_COMPRAS_CBTE. Comprobantes sin
   * documentLetter/pointOfSale/number cargados (ver
   * NewPurchaseInvoiceModal "Para el Libro de IVA Digital"), en moneda
   * distinta de ARS, o con una línea IVA_CREDITO incompleta (ver
   * CitiFileResult.skippedCount) se excluyen - no se inventa un código de
   * comprobante ARCA ni una cotización. */
  async getComprasCbte(from?: string, to?: string): Promise<CitiFileResult> {
    const range = defaultRange(from, to);
    const db = getTenantDb();
    const lines: string[] = [];
    let skippedCount = 0;

    const invoices = await db.purchaseInvoice.findMany({
      where: { supplierInvoiceDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: { taxLines: true, currency: { select: { code: true } } },
      orderBy: { supplierInvoiceDate: 'asc' },
    });
    for (const invoice of invoices) {
      if (!invoice.documentLetter || !invoice.pointOfSale || !invoice.number) {
        skippedCount += 1;
        continue;
      }
      // PurchaseInvoice no registra su propio tipo de cambio - para una
      // factura en moneda extranjera no hay cotización real que informar,
      // así que se excluye en vez de mentir con 1:1 (ver formatExchangeRate
      // más abajo, sólo corre para ARS de acá en más).
      if (invoice.currency.code !== 'ARS') {
        skippedCount += 1;
        continue;
      }
      if (hasIncompleteIvaCredito(invoice.taxLines)) {
        skippedCount += 1;
        continue;
      }
      const { docTipo, docNro } = resolveDocTipo(invoice.supplierTaxId);
      const ivaCredito = invoice.taxLines.filter((l) => l.type === 'IVA_CREDITO');
      const percepciones = invoice.taxLines.filter((l) => l.type === 'PERCEPCION');
      const creditoFiscal = ivaCredito.reduce((s, l) => s + l.amount.toNumber(), 0);
      const percIva = percepciones.filter((l) => l.taxType === 'VAT').reduce((s, l) => s + l.amount.toNumber(), 0);
      const percIibb = percepciones
        .filter((l) => l.taxType === 'GROSS_INCOME')
        .reduce((s, l) => s + l.amount.toNumber(), 0);
      const percOtrasNacionales = percepciones
        .filter((l) => l.taxType !== 'VAT' && l.taxType !== 'GROSS_INCOME')
        .reduce((s, l) => s + l.amount.toNumber(), 0);
      const rateGroups = groupByRate(
        ivaCredito
          .filter((l) => l.taxRate != null)
          .map((l) => ({ netAmount: 0, taxAmount: l.amount.toNumber(), taxRate: Number(l.taxRate) })),
      );

      lines.push(
        [
          formatDate(invoice.supplierInvoiceDate),
          CBTE_TIPO_FACTURA[invoice.documentLetter],
          padNum(invoice.pointOfSale, 5),
          padNum(invoice.number, 20),
          padAlfa('', 16), // Despacho de importación - no aplica
          docTipo,
          padNum(docNro, 20),
          padAlfa(invoice.supplierName, 30),
          formatAmount(invoice.total),
          formatAmount(0), // conceptos que no integran el neto gravado - no modelado en Compras
          formatAmount(0), // operaciones exentas - no modelado en Compras
          formatAmount(percIva),
          formatAmount(percOtrasNacionales),
          formatAmount(percIibb),
          formatAmount(0), // percepciones municipales - no modelado
          formatAmount(0), // impuestos internos - no modelado
          resolveMonId(invoice.currency.code),
          formatExchangeRate(1), // siempre ARS acá - moneda extranjera se excluye arriba
          String(Math.min(rateGroups.size, 9)),
          ' ', // código de operación - Compras no distingue exento/no gravado todavía
          formatAmount(creditoFiscal),
          formatAmount(0), // otros tributos
          padNum('', 11), // CUIT emisor/corredor - no aplica (sin comisionista)
          padAlfa('', 30), // denominación emisor/corredor
          formatAmount(0), // IVA comisión
        ].join(''),
      );
    }

    const creditNotes = await db.purchaseCreditNote.findMany({
      where: { supplierCreditNoteDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: { taxLines: true, currency: { select: { code: true } } },
      orderBy: { supplierCreditNoteDate: 'asc' },
    });
    for (const creditNote of creditNotes) {
      if (!creditNote.documentLetter || !creditNote.pointOfSale || !creditNote.number) {
        skippedCount += 1;
        continue;
      }
      if (creditNote.currency.code !== 'ARS') {
        skippedCount += 1;
        continue;
      }
      if (hasIncompleteIvaCredito(creditNote.taxLines)) {
        skippedCount += 1;
        continue;
      }
      const { docTipo, docNro } = resolveDocTipo(creditNote.supplierTaxId);
      const ivaCredito = creditNote.taxLines.filter((l) => l.type === 'IVA_CREDITO');
      const percepciones = creditNote.taxLines.filter((l) => l.type === 'PERCEPCION');
      const creditoFiscal = ivaCredito.reduce((s, l) => s + l.amount.toNumber(), 0);
      const percIva = percepciones.filter((l) => l.taxType === 'VAT').reduce((s, l) => s + l.amount.toNumber(), 0);
      const percIibb = percepciones
        .filter((l) => l.taxType === 'GROSS_INCOME')
        .reduce((s, l) => s + l.amount.toNumber(), 0);
      const percOtrasNacionales = percepciones
        .filter((l) => l.taxType !== 'VAT' && l.taxType !== 'GROSS_INCOME')
        .reduce((s, l) => s + l.amount.toNumber(), 0);
      const rateGroups = groupByRate(
        ivaCredito
          .filter((l) => l.taxRate != null)
          .map((l) => ({ netAmount: 0, taxAmount: l.amount.toNumber(), taxRate: Number(l.taxRate) })),
      );

      lines.push(
        [
          formatDate(creditNote.supplierCreditNoteDate),
          CBTE_TIPO_NOTA_CREDITO[creditNote.documentLetter],
          padNum(creditNote.pointOfSale, 5),
          padNum(creditNote.number, 20),
          padAlfa('', 16),
          docTipo,
          padNum(docNro, 20),
          padAlfa(creditNote.supplierName, 30),
          formatAmount(creditNote.total),
          formatAmount(0),
          formatAmount(0),
          formatAmount(percIva),
          formatAmount(percOtrasNacionales),
          formatAmount(percIibb),
          formatAmount(0),
          formatAmount(0),
          resolveMonId(creditNote.currency.code),
          formatExchangeRate(1),
          String(Math.min(rateGroups.size, 9)),
          ' ',
          formatAmount(creditoFiscal),
          formatAmount(0),
          padNum('', 11),
          padAlfa('', 30),
          formatAmount(0),
        ].join(''),
      );
    }

    return { content: lines.join('\r\n'), skippedCount };
  }

  /** LIBRO_IVA_DIGITAL_COMPRAS_ALICUOTAS. */
  async getComprasAlicuotas(from?: string, to?: string): Promise<CitiFileResult> {
    const range = defaultRange(from, to);
    const db = getTenantDb();
    const lines: string[] = [];
    let skippedCount = 0;

    const invoices = await db.purchaseInvoice.findMany({
      where: { supplierInvoiceDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: { taxLines: true },
      orderBy: { supplierInvoiceDate: 'asc' },
    });
    for (const invoice of invoices) {
      if (!invoice.documentLetter || !invoice.pointOfSale || !invoice.number) {
        skippedCount += 1;
        continue;
      }
      // Ver hasIncompleteIvaCredito - un comprobante con una fila
      // IVA_CREDITO vieja (sin taxRate/netAmount) se excluye entero, no
      // sólo esa línea, para que este archivo cierre con getComprasCbte.
      if (hasIncompleteIvaCredito(invoice.taxLines)) {
        skippedCount += 1;
        continue;
      }
      const { docTipo, docNro } = resolveDocTipo(invoice.supplierTaxId);
      const ivaCredito = invoice.taxLines.filter((l) => l.type === 'IVA_CREDITO');
      const rateGroups = groupByRate(
        ivaCredito.map((l) => ({
          netAmount: Number(l.netAmount),
          taxAmount: l.amount.toNumber(),
          taxRate: Number(l.taxRate),
        })),
      );
      for (const [rate, amounts] of rateGroups) {
        const code = resolveAlicuotaCode(rate);
        if (!code) continue;
        lines.push(
          [
            CBTE_TIPO_FACTURA[invoice.documentLetter],
            padNum(invoice.pointOfSale, 5),
            padNum(invoice.number, 20),
            docTipo,
            padNum(docNro, 20),
            formatAmount(amounts.netAmount),
            code,
            formatAmount(amounts.taxAmount),
          ].join(''),
        );
      }
    }

    const creditNotes = await db.purchaseCreditNote.findMany({
      where: { supplierCreditNoteDate: { gte: range.from, lte: range.to }, status: { not: 'CANCELLED' } },
      include: { taxLines: true },
      orderBy: { supplierCreditNoteDate: 'asc' },
    });
    for (const creditNote of creditNotes) {
      if (!creditNote.documentLetter || !creditNote.pointOfSale || !creditNote.number) {
        skippedCount += 1;
        continue;
      }
      if (hasIncompleteIvaCredito(creditNote.taxLines)) {
        skippedCount += 1;
        continue;
      }
      const { docTipo, docNro } = resolveDocTipo(creditNote.supplierTaxId);
      const ivaCredito = creditNote.taxLines.filter((l) => l.type === 'IVA_CREDITO');
      const rateGroups = groupByRate(
        ivaCredito.map((l) => ({
          netAmount: Number(l.netAmount),
          taxAmount: l.amount.toNumber(),
          taxRate: Number(l.taxRate),
        })),
      );
      for (const [rate, amounts] of rateGroups) {
        const code = resolveAlicuotaCode(rate);
        if (!code) continue;
        lines.push(
          [
            CBTE_TIPO_NOTA_CREDITO[creditNote.documentLetter],
            padNum(creditNote.pointOfSale, 5),
            padNum(creditNote.number, 20),
            docTipo,
            padNum(docNro, 20),
            formatAmount(amounts.netAmount),
            code,
            formatAmount(amounts.taxAmount),
          ].join(''),
        );
      }
    }

    return { content: lines.join('\r\n'), skippedCount };
  }
}
