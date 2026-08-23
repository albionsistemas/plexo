import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { VatBookEntry, VatBookResult } from './vat-book.types.js';

interface ColumnDef {
  header: string;
  width: number;
  value: (e: VatBookEntry) => string | number;
  isAmount?: boolean;
}

/** Compras no tiene desglose real por alícuota (ver el comentario en
 * VatBookService.getPurchasesBook) - así que ahí se muestra una única
 * columna "IVA Crédito Fiscal" (vatOther) en vez de las 3 columnas de
 * alícuota que sí tienen sentido para Ventas. Mismo criterio en el PDF. */
function columnsFor(kind: 'sales' | 'purchases'): ColumnDef[] {
  const base: ColumnDef[] = [
    { header: 'Fecha', width: 12, value: (e) => e.date },
    { header: 'Tipo de comprobante', width: 22, value: (e) => e.documentType },
  ];
  if (kind === 'sales') {
    base.push(
      { header: 'Punto de venta', width: 12, value: (e) => e.pointOfSale ?? '' },
      { header: 'Número', width: 14, value: (e) => e.number },
    );
  } else {
    base.push({ header: 'Número', width: 18, value: (e) => e.number });
  }
  base.push(
    { header: 'Razón Social', width: 28, value: (e) => e.counterpartyName },
    { header: 'Tipo Doc', width: 9, value: (e) => e.counterpartyDocType },
    { header: 'CUIT/DNI', width: 15, value: (e) => e.counterpartyTaxId ?? '' },
    { header: 'Condición IVA', width: 22, value: (e) => e.taxCondition ?? '' },
    { header: 'Moneda', width: 8, value: (e) => e.currencyCode },
    { header: 'Neto Gravado', width: 14, value: (e) => e.netTaxed, isAmount: true },
    { header: 'Neto Exento', width: 14, value: (e) => e.netExempt, isAmount: true },
    { header: 'Neto No Gravado', width: 16, value: (e) => e.netUntaxed, isAmount: true },
  );
  if (kind === 'sales') {
    base.push(
      { header: 'IVA 21%', width: 12, value: (e) => e.vat21, isAmount: true },
      { header: 'IVA 10.5%', width: 12, value: (e) => e.vat10_5, isAmount: true },
      { header: 'IVA 27%', width: 12, value: (e) => e.vat27, isAmount: true },
      { header: 'IVA Otras alícuotas', width: 16, value: (e) => e.vatOther, isAmount: true },
    );
  } else {
    base.push({ header: 'IVA Crédito Fiscal', width: 16, value: (e) => e.vatOther, isAmount: true });
  }
  base.push(
    { header: 'Percepciones', width: 14, value: (e) => e.perceptions, isAmount: true },
    { header: 'IVA Total', width: 13, value: (e) => e.vatTotal, isAmount: true },
    { header: 'Importe Total', width: 15, value: (e) => e.total, isAmount: true },
  );
  return base;
}

@Injectable()
export class VatBookExcelService {
  async generate(result: VatBookResult): Promise<Buffer> {
    const columns = columnsFor(result.kind);
    const workbook = new ExcelJS.Workbook();
    const title = result.kind === 'sales' ? 'Libro IVA Ventas' : 'Libro IVA Compras';
    const sheet = workbook.addWorksheet(title.slice(0, 31));

    sheet.mergeCells(1, 1, 1, columns.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `${title} - ${result.from} a ${result.to}`;
    titleCell.font = { bold: true, size: 13 };

    const headerRow = sheet.getRow(3);
    columns.forEach((col, i) => {
      headerRow.getCell(i + 1).value = col.header;
    });
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { bottom: { style: 'thin' } };
    });
    sheet.columns = columns.map((col) => ({ width: col.width }));

    result.entries.forEach((entry, rowIndex) => {
      const row = sheet.getRow(4 + rowIndex);
      columns.forEach((col, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.value = col.value(entry);
        if (col.isAmount) cell.numFmt = '#,##0.00';
      });
    });

    const totalsRowIndex = 4 + result.entries.length + 1;
    const totalsRow = sheet.getRow(totalsRowIndex);
    totalsRow.getCell(1).value = 'TOTALES';
    totalsRow.font = { bold: true };
    columns.forEach((col, colIndex) => {
      if (!col.isAmount) return;
      const key = (
        {
          'Neto Gravado': 'netTaxed',
          'Neto Exento': 'netExempt',
          'Neto No Gravado': 'netUntaxed',
          'IVA 21%': 'vat21',
          'IVA 10.5%': 'vat10_5',
          'IVA 27%': 'vat27',
          'IVA Otras alícuotas': 'vatOther',
          'IVA Crédito Fiscal': 'vatOther',
          Percepciones: 'perceptions',
          'IVA Total': 'vatTotal',
          'Importe Total': 'total',
        } as const
      )[col.header];
      const cell = totalsRow.getCell(colIndex + 1);
      cell.value = key ? result.totals[key] : '';
      cell.numFmt = '#,##0.00';
      cell.border = { top: { style: 'thin' } };
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
