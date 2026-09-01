import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getTenantDb, getTenantId } from '@plexo/database';
import type { Article } from '@plexo/database';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE_BYTES = 3 * 1024 * 1024; // 3MB - well under fastify's global 5MB multipart cap

/** First real file-storage feature in the project (2026-07-27 decision
 * with the user - see Article.imageUrl's schema comment). Files live on
 * local disk under `uploads/articles/`, named with a random uuid (not the
 * tenantId - see main.ts's @fastify/static registration for why serving
 * them unauthenticated is an acceptable, narrow exception here). No
 * resizing/compression: "pequeña" is solved by the UI showing a small
 * thumbnail, not by processing the file server-side (avoids pulling in a
 * native dependency like sharp on a machine without Docker). */
@Injectable()
export class ArticleImageService {
  private readonly logger = new Logger(ArticleImageService.name);
  private readonly uploadsDir = join(process.cwd(), 'uploads', 'articles');

  constructor(private readonly eventEmitter: EventEmitter2) {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async setImage(articleId: string, mimeType: string, buffer: Buffer): Promise<Article> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) {
      throw new BadRequestException('Only JPEG, PNG or WEBP images are allowed');
    }
    if (buffer.length > MAX_SIZE_BYTES) {
      throw new BadRequestException('Image must be smaller than 3MB');
    }

    const db = getTenantDb();
    const article = await db.article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const filename = `${randomUUID()}.${extension}`;
    await writeFile(join(this.uploadsDir, filename), buffer);

    const updated = await db.article.update({
      where: { id: articleId },
      data: { imageUrl: `/uploads/articles/${filename}` },
    });

    if (article.imageUrl) {
      await this.deleteFileForUrl(article.imageUrl);
    }
    this.eventEmitter.emit('article.catalog-changed', { tenantId: getTenantId(), articleId });
    return updated;
  }

  async removeImage(articleId: string): Promise<Article> {
    const db = getTenantDb();
    const article = await db.article.findUnique({ where: { id: articleId } });
    if (!article) {
      throw new NotFoundException('Article not found');
    }

    const updated = await db.article.update({ where: { id: articleId }, data: { imageUrl: null } });
    if (article.imageUrl) {
      await this.deleteFileForUrl(article.imageUrl);
    }
    this.eventEmitter.emit('article.catalog-changed', { tenantId: getTenantId(), articleId });
    return updated;
  }

  /** Best-effort: a stale file left on disk after a DB update is a minor
   * cleanup issue, never a reason to fail the request that already
   * succeeded at the thing the user asked for. */
  private async deleteFileForUrl(imageUrl: string): Promise<void> {
    const filename = imageUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await unlink(join(this.uploadsDir, filename));
    } catch (error) {
      this.logger.warn(`Failed to delete old article image ${filename}: ${error}`);
    }
  }
}
