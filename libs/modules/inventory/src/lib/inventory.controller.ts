import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { CreateArticleVariantDto } from './dto/create-article-variant.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { RecordStockMovementDto } from './dto/record-stock-movement.dto.js';
import { SetMinimumStockDto } from './dto/set-minimum-stock.dto.js';
import { InventoryService } from './inventory.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Roles(...WRITE_ROLES)
  @Post('warehouses')
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.inventoryService.createWarehouse(dto);
  }

  @Get('warehouses')
  listWarehouses() {
    return this.inventoryService.listWarehouses();
  }

  @Roles(...WRITE_ROLES)
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.inventoryService.createCategory(dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('articles')
  createArticle(@Body() dto: CreateArticleDto) {
    return this.inventoryService.createArticle(dto);
  }

  @Get('articles')
  listArticles() {
    return this.inventoryService.listArticles();
  }

  @Roles(...WRITE_ROLES)
  @Post('article-variants')
  createArticleVariant(@Body() dto: CreateArticleVariantDto) {
    return this.inventoryService.createArticleVariant(dto);
  }

  @Roles(...WRITE_ROLES)
  @Patch('article-variants/:id/price')
  updatePrice(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('unitPrice') unitPrice: number,
  ) {
    return this.inventoryService.updateArticleVariantPrice(id, unitPrice);
  }

  @Get('article-variants/:id/stock')
  async getConsolidatedStock(@Param('id', ParseUUIDPipe) id: string) {
    const quantity = await this.inventoryService.getConsolidatedStock(id);
    return { articleVariantId: id, quantity };
  }

  @Roles(...WRITE_ROLES)
  @Post('minimum-stock')
  setMinimumStock(@Body() dto: SetMinimumStockDto) {
    return this.inventoryService.setMinimumStock(dto);
  }

  @Roles(...WRITE_ROLES)
  @Post('movements')
  recordMovement(@Body() dto: RecordStockMovementDto) {
    return this.inventoryService.recordMovement(dto);
  }

  @Get('reorder-suggestions')
  listReorderSuggestions() {
    return this.inventoryService.listReorderSuggestions();
  }
}
