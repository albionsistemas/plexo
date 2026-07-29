import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { getTenantDb } from '@plexo/database';
import { InventoryService } from './inventory.service.js';

const MAX_ROWS = 100;

const UNITS_OF_MEASURE = ['UNIT', 'KG', 'LTR', 'MM', 'M2'] as const;

const COLUMNS = [
  { key: 'name', header: 'Nombre' },
  { key: 'sku', header: 'SKU' },
  { key: 'unitPrice', header: 'Precio de venta' },
  { key: 'unitOfMeasure', header: 'Unidad de medida' },
  { key: 'categoryName', header: 'Categoría' },
  { key: 'taxCode', header: 'Código de impuesto' },
  { key: 'isService', header: 'Es servicio' },
  { key: 'isPublished', header: 'Publicado' },
  { key: 'color', header: 'Color' },
  { key: 'size', header: 'Talle' },
  { key: 'brand', header: 'Marca' },
  { key: 'warehouseName', header: 'Depósito' },
  { key: 'initialStock', header: 'Stock inicial' },
  { key: 'unitCost', header: 'Costo unitario' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

const REQUIRED_COLUMNS: ColumnKey[] = ['name', 'sku', 'unitPrice'];

const INSTRUCTIONS =
  'INSTRUCCIONES: Nombre, SKU y Precio de venta son obligatorios. El SKU debe ser único ' +
  '(no puede repetirse en el archivo ni coincidir con uno ya cargado). Unidad de medida: ' +
  'UNIT, KG, LTR, MM o M2 (si se deja vacío, se usa UNIT). Categoría y Depósito se crean ' +
  'automáticamente si no existen. Código de impuesto debe coincidir con uno ya cargado y ' +
  'vigente en Impuestos (se deja vacío si el artículo no lleva impuesto). Es servicio y ' +
  'Publicado: SI o NO (si se deja vacío, se usa NO). Para cargar stock inicial completá ' +
  'Depósito, Stock inicial y Costo unitario juntos (los tres, o ninguno). Artículos con el ' +
  'mismo Nombre en varias filas se tratan como variantes de un mismo artículo, y deben ' +
  'coincidir en Unidad de medida, Categoría, Código de impuesto, Es servicio y Publicado. ' +
  'El importador ignora filas completamente vacías. Máximo 100 filas de datos por archivo.';

export interface ImportRowError {
  row: number;
  sku?: string;
  message: string;
}

export interface ImportResult {
  created: number;
  errors: ImportRowError[];
}

interface ParsedRow {
  rowNumber: number;
  name: string;
  sku: string;
  unitPrice: number;
  unitOfMeasure: (typeof UNITS_OF_MEASURE)[number];
  categoryName: string | null;
  taxCode: string | null;
  isService: boolean;
  isPublished: boolean;
  color: string | null;
  size: string | null;
  brand: string | null;
  warehouseName: string | null;
  initialStock: number | null;
  unitCost: number | null;
}

const COMBINING_DIACRITICS = new RegExp('[̀-ͯ]', 'g');

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '')
    .trim()
    .toLowerCase();
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function cellBoolean(value: unknown): { ok: true; value: boolean } | { ok: false } {
  const text = cellText(value).toUpperCase();
  if (text === '') return { ok: true, value: false };
  if (text === 'SI' || text === 'SÍ') return { ok: true, value: true };
  if (text === 'NO') return { ok: true, value: false };
  return { ok: false };
}

@Injectable()
export class ArticleImportService {
  constructor(private readonly inventoryService: InventoryService) {}

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Artículos');
    const headers = COLUMNS.map((c) => c.header);

    sheet.columns = COLUMNS.map(() => ({ width: 20 }));

    sheet.mergeCells(1, 1, 1, headers.length);
    const instructionsCell = sheet.getCell(1, 1);
    instructionsCell.value = INSTRUCTIONS;
    instructionsCell.alignment = { wrapText: true, vertical: 'top' };
    instructionsCell.font = { bold: true };
    sheet.getRow(1).height = 90;

    const headerRow = sheet.getRow(2);
    headerRow.values = headers;
    headerRow.font = { bold: true };

    sheet.getRow(3).values = [
      'Ejemplo - Silla de oficina',
      'EJEMPLO-001',
      15000,
      'UNIT',
      'Muebles',
      '',
      'NO',
      'NO',
      'Negro',
      '',
      '',
      'Depósito Central',
      10,
      9000,
    ];

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async importFromBuffer(buffer: Buffer): Promise<ImportResult> {
    const workbook = new ExcelJS.Workbook();
    // exceljs's bundled .d.ts predates the generic Buffer<TArrayBuffer> type
    // introduced in newer @types/node - same runtime value, cast needed to
    // satisfy the structurally-stricter declared parameter type.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('El archivo no tiene ninguna hoja');
    }

    const headerRow = sheet.getRow(2);
    const columnIndexByKey = new Map<ColumnKey, number>();
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const normalized = normalizeHeader(cellText(cell.value));
      const match = COLUMNS.find((c) => normalizeHeader(c.header) === normalized);
      if (match) columnIndexByKey.set(match.key, colNumber);
    });

    const missingColumns = REQUIRED_COLUMNS.filter((key) => !columnIndexByKey.has(key));
    if (missingColumns.length > 0) {
      const labels = missingColumns.map((key) => COLUMNS.find((c) => c.key === key)?.header);
      return {
        created: 0,
        errors: [
          {
            row: 2,
            message: `Faltan columnas obligatorias en el archivo: ${labels.join(', ')}`,
          },
        ],
      };
    }

    const get = (row: ExcelJS.Row, key: ColumnKey): unknown => {
      const col = columnIndexByKey.get(key);
      return col ? row.getCell(col).value : undefined;
    };

    const dataRows: ExcelJS.Row[] = [];
    for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      const isBlank = COLUMNS.every((c) => cellText(get(row, c.key)) === '');
      if (!isBlank) dataRows.push(row);
    }

    if (dataRows.length === 0) {
      return { created: 0, errors: [{ row: 3, message: 'El archivo no tiene filas de datos' }] };
    }
    if (dataRows.length > MAX_ROWS) {
      return {
        created: 0,
        errors: [
          {
            row: 0,
            message: `El archivo tiene ${dataRows.length} filas, el máximo por importación es ${MAX_ROWS}. Dividilo en partes más chicas.`,
          },
        ],
      };
    }

    const errors: ImportRowError[] = [];
    const parsedRows: ParsedRow[] = [];
    const skusSeen = new Map<string, number>();

    for (const row of dataRows) {
      const rowNumber = row.number;
      const name = cellText(get(row, 'name'));
      const sku = cellText(get(row, 'sku'));
      const unitPrice = cellNumber(get(row, 'unitPrice'));
      const unitOfMeasureRaw = cellText(get(row, 'unitOfMeasure')).toUpperCase();
      const categoryName = cellText(get(row, 'categoryName')) || null;
      const taxCode = cellText(get(row, 'taxCode')) || null;
      const isServiceResult = cellBoolean(get(row, 'isService'));
      const isPublishedResult = cellBoolean(get(row, 'isPublished'));
      const color = cellText(get(row, 'color')) || null;
      const size = cellText(get(row, 'size')) || null;
      const brand = cellText(get(row, 'brand')) || null;
      const warehouseName = cellText(get(row, 'warehouseName')) || null;
      const initialStock = cellNumber(get(row, 'initialStock'));
      const unitCost = cellNumber(get(row, 'unitCost'));

      if (!name) {
        errors.push({ row: rowNumber, sku, message: 'Falta el nombre' });
        continue;
      }
      if (!sku) {
        errors.push({ row: rowNumber, message: 'Falta el SKU' });
        continue;
      }
      if (skusSeen.has(sku)) {
        errors.push({
          row: rowNumber,
          sku,
          message: `SKU duplicado en el archivo (ya aparece en la fila ${skusSeen.get(sku)})`,
        });
        continue;
      }
      skusSeen.set(sku, rowNumber);

      if (unitPrice === null || unitPrice <= 0) {
        errors.push({ row: rowNumber, sku, message: 'Precio de venta inválido, debe ser un número mayor a 0' });
        continue;
      }

      const unitOfMeasure = unitOfMeasureRaw === '' ? 'UNIT' : unitOfMeasureRaw;
      if (!UNITS_OF_MEASURE.includes(unitOfMeasure as (typeof UNITS_OF_MEASURE)[number])) {
        errors.push({
          row: rowNumber,
          sku,
          message: `Unidad de medida inválida "${unitOfMeasureRaw}" (valores permitidos: ${UNITS_OF_MEASURE.join(', ')})`,
        });
        continue;
      }

      if (!isServiceResult.ok) {
        errors.push({ row: rowNumber, sku, message: 'Es servicio debe ser SI o NO' });
        continue;
      }
      if (!isPublishedResult.ok) {
        errors.push({ row: rowNumber, sku, message: 'Publicado debe ser SI o NO' });
        continue;
      }

      const stockFieldsFilled = [warehouseName, initialStock, unitCost].filter(
        (v) => v !== null,
      ).length;
      if (stockFieldsFilled > 0 && stockFieldsFilled < 3) {
        errors.push({
          row: rowNumber,
          sku,
          message: 'Para cargar stock inicial completá Depósito, Stock inicial y Costo unitario juntos',
        });
        continue;
      }
      if (warehouseName && (initialStock === null || initialStock <= 0)) {
        errors.push({ row: rowNumber, sku, message: 'Stock inicial inválido, debe ser un número mayor a 0' });
        continue;
      }
      if (warehouseName && (unitCost === null || unitCost < 0)) {
        errors.push({ row: rowNumber, sku, message: 'Costo unitario inválido, debe ser un número mayor o igual a 0' });
        continue;
      }

      parsedRows.push({
        rowNumber,
        name,
        sku,
        unitPrice,
        unitOfMeasure: unitOfMeasure as (typeof UNITS_OF_MEASURE)[number],
        categoryName,
        taxCode,
        isService: isServiceResult.value,
        isPublished: isPublishedResult.value,
        color,
        size,
        brand,
        warehouseName,
        initialStock,
        unitCost,
      });
    }

    // Group by article name - rows sharing a name become variants of one
    // Article, and must agree on every article-level field (see
    // INSTRUCTIONS). Checked here, after per-row validation, since it needs
    // rows from more than one line at a time.
    const groups = new Map<string, ParsedRow[]>();
    for (const row of parsedRows) {
      const list = groups.get(row.name) ?? [];
      list.push(row);
      groups.set(row.name, list);
    }
    for (const [name, rows] of groups) {
      const [first, ...rest] = rows;
      for (const row of rest) {
        const mismatch =
          row.unitOfMeasure !== first.unitOfMeasure ||
          row.categoryName !== first.categoryName ||
          row.taxCode !== first.taxCode ||
          row.isService !== first.isService ||
          row.isPublished !== first.isPublished;
        if (mismatch) {
          errors.push({
            row: row.rowNumber,
            sku: row.sku,
            message: `La fila ${row.rowNumber} tiene el mismo nombre que la fila ${first.rowNumber} ("${name}") pero con Unidad de medida/Categoría/Código de impuesto/Es servicio/Publicado distintos - deben coincidir para variantes del mismo artículo`,
          });
        }
      }
    }

    // Reference-data snapshots, taken once against the DB, used to resolve
    // SKU/category/warehouse/tax without any query inside the write loop.
    const db = getTenantDb();
    const [existingVariants, existingCategories, existingWarehouses, activeTaxes] =
      await Promise.all([
        db.articleVariant.findMany({ select: { sku: true } }),
        db.category.findMany({ where: { parentId: null }, select: { id: true, name: true } }),
        db.warehouse.findMany({ select: { id: true, name: true } }),
        db.taxDefinition.findMany({
          where: { validTo: null },
          select: { id: true, code: true },
        }),
      ]);

    const existingSkus = new Set(existingVariants.map((v) => v.sku));
    for (const row of parsedRows) {
      if (existingSkus.has(row.sku)) {
        errors.push({ row: row.rowNumber, sku: row.sku, message: 'El SKU ya existe' });
      }
    }

    const taxCodeCounts = new Map<string, number>();
    for (const t of activeTaxes) {
      taxCodeCounts.set(t.code, (taxCodeCounts.get(t.code) ?? 0) + 1);
    }
    const taxIdByCode = new Map(activeTaxes.map((t) => [t.code, t.id]));
    for (const row of parsedRows) {
      if (row.taxCode === null) continue;
      const count = taxCodeCounts.get(row.taxCode) ?? 0;
      if (count === 0) {
        errors.push({
          row: row.rowNumber,
          sku: row.sku,
          message: `El código de impuesto "${row.taxCode}" no existe o no está vigente`,
        });
      } else if (count > 1) {
        errors.push({
          row: row.rowNumber,
          sku: row.sku,
          message: `El código de impuesto "${row.taxCode}" tiene más de una versión vigente, no se puede resolver automáticamente`,
        });
      }
    }

    if (errors.length > 0) {
      return { created: 0, errors: errors.sort((a, b) => a.row - b.row) };
    }

    // Everything validated clean - resolve/create categories and
    // warehouses (case-insensitive match, dedupe new ones within the file
    // itself so two rows requesting the same new name don't create it
    // twice), then write.
    const categoryIdByName = new Map(
      existingCategories.map((c) => [c.name.toLowerCase(), c.id]),
    );
    const newCategoryNames = new Set(
      parsedRows
        .map((r) => r.categoryName)
        .filter((n): n is string => n !== null && !categoryIdByName.has(n.toLowerCase())),
    );
    for (const name of newCategoryNames) {
      const created = await this.inventoryService.createCategory({ name });
      categoryIdByName.set(name.toLowerCase(), created.id);
    }

    const warehouseIdByName = new Map(
      existingWarehouses.map((w) => [w.name.toLowerCase(), w.id]),
    );
    const newWarehouseNames = new Set(
      parsedRows
        .map((r) => r.warehouseName)
        .filter((n): n is string => n !== null && !warehouseIdByName.has(n.toLowerCase())),
    );
    for (const name of newWarehouseNames) {
      const created = await this.inventoryService.createWarehouse({ name });
      warehouseIdByName.set(name.toLowerCase(), created.id);
    }

    let created = 0;
    for (const [, rows] of groups) {
      const first = rows[0];
      const article = await this.inventoryService.createArticle({
        name: first.name,
        unitOfMeasure: first.unitOfMeasure,
        categoryId: first.categoryName ? categoryIdByName.get(first.categoryName.toLowerCase()) : undefined,
        taxDefinitionId: first.taxCode ? taxIdByCode.get(first.taxCode) : undefined,
        isService: first.isService,
        isPublished: first.isPublished,
      });

      for (const row of rows) {
        const variant = await this.inventoryService.createArticleVariant({
          articleId: article.id,
          sku: row.sku,
          color: row.color ?? undefined,
          size: row.size ?? undefined,
          brand: row.brand ?? undefined,
          unitPrice: row.unitPrice,
        });
        created++;

        if (row.warehouseName && row.initialStock !== null && row.unitCost !== null) {
          const warehouseId = warehouseIdByName.get(row.warehouseName.toLowerCase());
          if (warehouseId) {
            await this.inventoryService.recordMovement({
              warehouseId,
              articleVariantId: variant.id,
              type: 'PURCHASE_IN',
              quantity: row.initialStock,
              unitCost: row.unitCost,
              sourceType: 'IMPORT',
            });
          }
        }
      }
    }

    return { created, errors: [] };
  }
}
