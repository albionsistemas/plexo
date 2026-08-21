import { Module } from '@nestjs/common';
import { ArticleAttachmentsService } from './article-attachments.service.js';
import { ArticleImageService } from './article-image.service.js';
import { ArticleImportService } from './article-import.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, ArticleImportService, ArticleImageService, ArticleAttachmentsService],
  exports: [InventoryService],
})
export class InventoryModule {}
