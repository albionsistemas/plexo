import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { SupplierStatement, SupplierStatementEntry } from '../payables.service.js';

interface ColumnDef {
  header: string;
  width: number;
  value: (e: SupplierStatementEntry) => string | number;
  isAmount?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { header: 'Fecha', width: 12, value: (e) => e.date.toLocaleDateString('es-AR', { timeZone: 'UTC' }) },
  { header: 'Comprobante', width: 40, value: (e) => e.documentNumber },
  {
    header: 'Vencimiento',
    width: 12,
    value: (e) => (e.dueDate ? e.dueDate.toLocaleDateString('es-AR', { timeZone: 'UTC' }) : ''),
  },
  { header: 'Debe', width: 14, value: (e) => e.debe.toNumber(), isAmount: true },
  { header: 'Haber', width: 14, value: (e) => e.haber.toNumber(), isAmount: true },
  { header: 'Saldo Acumulado', width: 16, value: (e) => e.balance.toNumber(), isAmount: true },
  { header: 'Estado', width: 18, value: (e) => e.status ?? '' },
];

@Injectable()
export class SupplierStatementExcelService {
  async generate(statement: SupplierStatement): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cuenta Corriente'.slice(0, 31));

    sheet.mergeCells(1, 1, 1, COLUMNS.length);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = `Cuenta Corriente - ${statement.supplierName}`;
    titleCell.font = { bold: true, size: 13 };

    const metricsRow = sheet.getRow(2);
    metricsRow.getCell(1).value =
      `Vencido: $${statement.totalOverdue.toFixed(2)}  |  A vencer: $${statement.totalNotYetDue.toFixed(2)}  |  Total: $${statement.totalOutstanding.toFixed(2)}`;
    metricsRow.font = { italic: true, color: { argb: 'FF4B5563' } };

    const headerRow = sheet.getRow(4);
    COLUMNS.forEach((col, i) => {
      headerRow.getCell(i + 1).value = col.header;
    });
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.border = { bottom: { style: 'thin' } };
    });
    sheet.columns = COLUMNS.map((col) => ({ width: col.width }));

    statement.entries.forEach((entry, rowIndex) => {
      const row = sheet.getRow(5 + rowIndex);
      COLUMNS.forEach((col, colIndex) => {
        const cell = row.getCell(colIndex + 1);
        cell.value = col.value(entry);
        if (col.isAmount) cell.numFmt = '#,##0.00';
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }
}
