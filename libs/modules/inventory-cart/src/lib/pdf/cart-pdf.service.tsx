import { Injectable } from '@nestjs/common';
import { renderToBuffer } from '@react-pdf/renderer';
import { getTenantDb, getTenantId, getUserId } from '@plexo/database';
import type { CartLineDetail } from '../inventory-cart.service.js';
import type { CartPdfData } from './cart-pdf-data.js';
import { CartListTemplate } from './cart-list.template.js';

@Injectable()
export class CartPdfService {
  async generate(lines: CartLineDetail[]): Promise<Buffer> {
    const db = getTenantDb();
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: getTenantId() } });
    const userId = getUserId();
    const user = userId
      ? await db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
      : null;

    const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
    const data: CartPdfData = {
      tenantName: tenant.name,
      generatedAt: new Date().toLocaleDateString('es-AR'),
      requestedByName: user?.name ?? user?.email ?? '-',
      lines: lines.map((line) => ({
        articleName: line.articleName,
        variantLabel: line.variantLabel,
        sku: line.sku,
        categoryName: line.categoryName,
        quantity: line.quantity.toString(),
        unitPrice: line.unitPrice.toFixed(2),
        lineTotal: line.lineTotal.toFixed(2),
      })),
      total: total.toFixed(2),
    };

    return renderToBuffer(<CartListTemplate data={data} />);
  }
}
