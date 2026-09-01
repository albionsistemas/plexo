import { Controller, Get, Post } from '@nestjs/common';
import { TiendanubeCatalogSyncService } from './tiendanube-catalog-sync.service.js';

/** El disparador manual de bulk sync ("sincronizar catálogo ahora") y el
 * status para la card del panel de sincronización (Fase 5) - la
 * sincronización por artículo individual corre sola, disparada por el
 * evento article.catalog-changed (ver TiendanubeCatalogSyncService), sin
 * ruta propia. */
@Controller('connectors/tiendanube/catalog')
export class TiendanubeCatalogSyncController {
  constructor(private readonly catalogSyncService: TiendanubeCatalogSyncService) {}

  @Get('status')
  status(): Promise<{ publishedCount: number; syncedCount: number }> {
    return this.catalogSyncService.getCatalogStatus();
  }

  @Post('sync')
  sync(): Promise<{ total: number; synced: number; skipped: Array<{ articleId: string; name: string; reason: string }> }> {
    return this.catalogSyncService.syncAllPublished();
  }
}
