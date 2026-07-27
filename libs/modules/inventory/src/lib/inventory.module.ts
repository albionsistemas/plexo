import { Module } from '@nestjs/common';
import { ArticleImportService } from './article-import.service.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, ArticleImportService],
  exports: [InventoryService],
})
export class InventoryModule {}
