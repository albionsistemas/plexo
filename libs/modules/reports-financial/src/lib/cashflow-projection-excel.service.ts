import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { CashflowLineItem, CashflowProjection } from './cashflow-projection.types.js';

const FLOW_LABELS: Record<'INFLOW' | 'OUTFLOW', string> = { INFLOW: 'Ingreso', OUTFLOW: 'Egreso' };
const TYPE_LABELS: Record<CashflowLineItem['type'], string> = { INVOICE: 'Factura', CHECK: 'Cheque' };

/** Mismo patrón que VatBookExcelService (libs/modules/taxes) - una sola
 * hoja, resumen arriba, detalle abajo. A diferencia del Libro IVA, acá el
 * detalle es plano (no una fila por comprobante-columna-por-alícuota) -
 * cada línea de flujo (factura o cheque) es una fila con su semana, así
 * el Excel sirve como auditoría completa de qué compone cada tramo sin
 * tener que abrir 5 sub-tablas. */
@Injectable()
export class CashflowProjectionExcelService {
  async generate(result: CashflowProjection): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Flujo de Caja');

    sheet.mergeCells(1, 1, 1, 7);
    sheet.getCell(1, 1).value = `Flujo de Caja Proyectado - ${result.fromDate} a ${result.toDate}`;
    sheet.getCell(1, 1).font = { bold: true, size: 13 };

    const summaryRows: [string, number][] = [
      ['Disponibilidad inicial', result.openingBalance],
      ['Ingresos proyectados', result.totalInflows],
      ['Egresos proyectados', result.totalOutflows],
      ['Posición neta al cierre', result.closingBalance],
    ];
    summaryRows.forEach(([label, value], i) => {
      const row = sheet.getRow(3 + i);
      row.getCell(1).value = label;
      row.getCell(1).font = { bold: true };
      row.getCell(2).value = value;
      row.getCell(2).numFmt = '#,##0.00';
    });

    const headerRowIndex = 3 + summaryRows.length + 1;
    const headers = ['Semana', 'Flujo', 'Origen', 'Referencia', 'Contraparte', 'Vencimiento', 'Importe'];
    const headerRow = sheet.getRow(headerRowIndex);
    headers.forEach((h, i) => (headerRow.getCell(i + 1).value = h));
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => (cell.border = { bottom: { style: 'thin' } }));
    sheet.columns = [
      { width: 22 },
      { width: 10 },
      { width: 10 },
      { width: 20 },
      { width: 28 },
      { width: 14 },
      { width: 15 },
    ];

    let rowIndex = headerRowIndex + 1;
    for (const week of result.weeks) {
      const weekLabel = `${week.weekStart} a ${week.weekEnd}`;
      const lines: [CashflowLineItem, 'INFLOW' | 'OUTFLOW'][] = [
        ...week.invoiceInflows.map((i): [CashflowLineItem, 'INFLOW'] => [i, 'INFLOW']),
        ...week.checkInflows.map((i): [CashflowLineItem, 'INFLOW'] => [i, 'INFLOW']),
        ...week.invoiceOutflows.map((i): [CashflowLineItem, 'OUTFLOW'] => [i, 'OUTFLOW']),
        ...week.checkOutflows.map((i): [CashflowLineItem, 'OUTFLOW'] => [i, 'OUTFLOW']),
      ];
      if (lines.length === 0) continue;
      for (const [item, direction] of lines) {
        const row = sheet.getRow(rowIndex++);
        row.getCell(1).value = weekLabel;
        row.getCell(2).value = FLOW_LABELS[direction];
        row.getCell(3).value = TYPE_LABELS[item.type];
        row.getCell(4).value = item.reference;
        row.getCell(5).value = item.counterparty ?? '';
        row.getCell(6).value = item.dueDate ?? '';
        row.getCell(7).value = direction === 'OUTFLOW' ? -item.amount : item.amount;
        row.getCell(7).numFmt = '#,##0.00';
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
