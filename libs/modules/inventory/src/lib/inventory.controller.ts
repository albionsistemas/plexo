import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  StreamableFile,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import '@fastify/multipart';
import { Roles } from '@plexo/auth';
import { AuditEntity } from '@plexo/database';
import { ArticleImageService } from './article-image.service.js';
import { ArticleImportService } from './article-import.service.js';
import { CreateArticleDto } from './dto/create-article.dto.js';
import { UpdateArticleDto } from './dto/update-article.dto.js';
import { CreateArticleVariantDto } from './dto/create-article-variant.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { CreateWarehouseDto } from './dto/create-warehouse.dto.js';
import { RecordStockMovementDto } from './dto/record-stock-movement.dto.js';
import { SetMinimumStockDto } from './dto/set-minimum-stock.dto.js';
import { InventoryService } from './inventory.service.js';

const WRITE_ROLES = ['OWNER', 'ADMIN', 'INVENTORY'] as const;

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventoryService: InventoryService,
    private readonly articleImportService: ArticleImportService,
    private readonly articleImageService: ArticleImageService,
  ) {}

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

  @Get('categories')
  listCategories() {
    return this.inventoryService.listCategories();
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

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Patch('articles/:id')
  updateArticle(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateArticleDto) {
    return this.inventoryService.updateArticle(id, dto);
  }

  @Roles(...WRITE_ROLES)
  @Get('articles/import/template')
  async downloadImportTemplate() {
    const buffer = await this.articleImportService.generateTemplate();
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="plantilla-articulos.xlsx"',
    });
  }

  @Roles(...WRITE_ROLES)
  @Post('articles/import')
  async importArticles(@Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.articleImportService.importFromBuffer(buffer);
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

  @Get('article-variants/:id/price-history')
  getPriceHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.inventoryService.getPriceHistory(id);
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

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Post('articles/:id/image')
  async uploadArticleImage(@Param('id', ParseUUIDPipe) id: string, @Req() req: FastifyRequest) {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const buffer = await data.toBuffer();
    return this.articleImageService.setImage(id, data.mimetype, buffer);
  }

  @AuditEntity('article', { labelFields: ['name'] })
  @Roles(...WRITE_ROLES)
  @Delete('articles/:id/image')
  removeArticleImage(@Param('id', ParseUUIDPipe) id: string) {
    return this.articleImageService.removeImage(id);
  }
}
