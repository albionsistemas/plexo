import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getTenantDb } from '@plexo/database';
import type { Article } from '@plexo/database';

const BROCHURE_MIME_TYPE = 'application/pdf';
const BROCHURE_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB - un folleto puede traer varias imágenes

// El navegador/SO no siempre manda el mismo tipo MIME para un .zip
// (application/zip, application/x-zip-compressed, o directamente
// application/octet-stream según el caso) - por eso se exige ADEMÁS que el
// nombre original termine en .zip, en vez de confiar sólo en el MIME.
const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);
const ZIP_MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

/** "Folleto" (PDF) y adjunto ZIP opcionales por artículo - dato extra, no
 * fiscal/financiero (mismo criterio que Article.imageUrl). Mismo patrón que
 * ArticleImageService/GoodsReceiptAttachmentService: disco local bajo
 * uploads/articles/ (comparte carpeta con las imágenes, ambos son "archivos
 * del artículo"), nombre random-uuid, servido sin autenticación vía
 * @fastify/static (main.ts, ya cubre cualquier subcarpeta de uploads/). */
@Injectable()
export class ArticleAttachmentsService {
  private readonly logger = new Logger(ArticleAttachmentsService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'articles');

  constructor() {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setBrochure(articleId: string, mimeType: string, buffer: Buffer): Promise<Article> {
    if (mimeType !== BROCHURE_MIME_TYPE) {
      throw new BadRequestException('Only PDF files are allowed');
    }
    if (buffer.length > BROCHURE_MAX_SIZE_BYTES) {
      throw new BadRequestException('The brochure must be smaller than 10MB');
    }

    const db = getTenantDb();
    const article = await db.article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const filename = `${randomUUID()}.pdf`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.article.update({
      where: { id: articleId },
      data: { brochureUrl: `/uploads/articles/${filename}` },
    });

    if (article.brochureUrl) {
      await this.deleteFileForUrl(article.brochureUrl);
    }
    return updated;
  }

  async removeBrochure(articleId: string): Promise<Article> {
    const db = getTenantDb();
    const article = await db.article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const updated = await db.article.update({ where: { id: articleId }, data: { brochureUrl: null } });
    if (article.brochureUrl) {
      await this.deleteFileForUrl(article.brochureUrl);
    }
    return updated;
  }

  async setAttachmentZip(
    articleId: string,
    mimeType: string,
    originalFilename: string,
    buffer: Buffer,
  ): Promise<Article> {
    const looksLikeZip = ZIP_MIME_TYPES.has(mimeType) && originalFilename.toLowerCase().endsWith('.zip');
    if (!looksLikeZip) {
      throw new BadRequestException('Only ZIP files are allowed');
    }
    if (buffer.length > ZIP_MAX_SIZE_BYTES) {
      throw new BadRequestException('The ZIP file must be smaller than 20MB');
    }

    const db = getTenantDb();
    const article = await db.article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const filename = `${randomUUID()}.zip`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.article.update({
      where: { id: articleId },
      data: { attachmentZipUrl: `/uploads/articles/${filename}` },
    });

    if (article.attachmentZipUrl) {
      await this.deleteFileForUrl(article.attachmentZipUrl);
    }
    return updated;
  }

  async removeAttachmentZip(articleId: string): Promise<Article> {
    const db = getTenantDb();
    const article = await db.article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const updated = await db.article.update({
      where: { id: articleId },
      data: { attachmentZipUrl: null },
    });
    if (article.attachmentZipUrl) {
      await this.deleteFileForUrl(article.attachmentZipUrl);
    }
    return updated;
  }

  /** Best-effort: un archivo huérfano en disco tras una actualización de la
   * base es un problema de limpieza menor, nunca un motivo para fallar un
   * request que ya logró lo que el usuario pidió - mismo criterio que
   * ArticleImageService/GoodsReceiptAttachmentService. */
  private async deleteFileForUrl(url: string): Promise<void> {
    const filename = url.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`Failed to delete old article attachment ${filename}: ${error}`);
    }
  }
}
