import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import type { PurchaseInvoice } from '@plexo/database';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB - same cap as GoodsReceiptAttachmentService

/** Same pattern as GoodsReceiptAttachmentService (photo/scan of a physical
 * document, local disk, unauthenticated /uploads/ prefix, no resizing) -
 * see that file's own doc comment for the full rationale, not repeated
 * here. */
@Injectable()
export class PurchaseInvoiceAttachmentService {
  private readonly logger = new Logger(PurchaseInvoiceAttachmentService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'purchase-invoices');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setAttachment(invoiceId: string, mimeType: string, buffer: Buffer): Promise<PurchaseInvoice> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG, WEBP or PDF files are allowed');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('File must be smaller than 3MB');
    }

    const db = getTenantDb();
    const invoice = await db.purchaseInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.purchaseInvoice.update({
      where: { id: invoiceId },
      data: { attachmentUrl: `/uploads/purchase-invoices/${filename}` },
    });

    if (invoice.attachmentUrl) {
      await this.deleteFileForUrl(invoice.attachmentUrl);
    }
    return updated;
  }

  private async deleteFileForUrl(attachmentUrl: string): Promise<void> {
    const filename = attachmentUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`Failed to delete old purchase invoice attachment ${filename}: ${error}`);
    }
  }
}
