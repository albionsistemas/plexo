import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import type { GoodsReceipt } from '@plexo/database';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  // A remito is as often scanned/emailed as a PDF as it is photographed -
  // wider allowlist than ArticleImageService's (a product photo is never
  // a PDF, a delivery document often is).
  'application/pdf': 'pdf',
};
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB - same cap as ArticleImageService

/** Same pattern as libs/modules/inventory's ArticleImageService: local disk
 * under uploads/, random uuid filename, served unauthenticated via
 * @fastify/static's generic /uploads/ prefix (main.ts) - no change needed
 * there, it already covers any subfolder. No resizing - a remito photo is
 * shown small in the UI, not processed server-side, same reasoning as
 * article images (no native image-processing dependency on a machine
 * without Docker). */
@Injectable()
export class GoodsReceiptAttachmentService {
  private readonly logger = new Logger(GoodsReceiptAttachmentService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'goods-receipts');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setAttachment(receiptId: string, mimeType: string, buffer: Buffer): Promise<GoodsReceipt> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG, WEBP or PDF files are allowed');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('File must be smaller than 3MB');
    }

    const db = getTenantDb();
    const receipt = await db.goodsReceipt.findUnique({ where: { id: receiptId } });
    if (!receipt) {
      throw new NotFoundException('Goods receipt not found');
    }

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.goodsReceipt.update({
      where: { id: receiptId },
      data: { attachmentUrl: `/uploads/goods-receipts/${filename}` },
    });

    if (receipt.attachmentUrl) {
      await this.deleteFileForUrl(receipt.attachmentUrl);
    }
    return updated;
  }

  /** Best-effort: a stale file left on disk after a DB update is a minor
   * cleanup issue, never a reason to fail a request that already succeeded
   * at the thing the user asked for - same criterion as ArticleImageService. */
  private async deleteFileForUrl(attachmentUrl: string): Promise<void> {
    const filename = attachmentUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`Failed to delete old goods receipt attachment ${filename}: ${error}`);
    }
  }
}
