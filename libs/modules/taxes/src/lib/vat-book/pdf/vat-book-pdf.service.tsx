import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { VatBookResult } from '../vat-book.types.js';
import { buildVatBookPdfData } from './build-pdf-data.js';
import { VatBookTemplate } from './vat-book.template.js';

@Injectable()
export class VatBookPdfService {
  async generate(result: VatBookResult): Promise<{ buffer: Buffer; filename: string }> {
    const tenant = await getTenantDb().tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const data = buildVatBookPdfData(result, { name: tenant.name, taxId: tenant.taxId });
    const buffer = await renderToBuffer(<VatBookTemplate data={data} />);
    const prefix = result.kind === 'sales' ? 'libro-iva-ventas' : 'libro-iva-compras';
    return { buffer, filename: `${prefix}_${result.from}_${result.to}.pdf` };
  }
}
