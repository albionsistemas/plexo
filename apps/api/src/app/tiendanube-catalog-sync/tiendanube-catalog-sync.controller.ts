import { Controller, Post } from '@nestjs/common';
import { TiendanubeCatalogSyncService } from './tiendanube-catalog-sync.service.js';

/** Sólo el disparador manual de bulk sync ("sincronizar catálogo ahora") -
 * la sincronización por artículo individual corre sola, disparada por el
 * evento article.catalog-changed (ver TiendanubeCatalogSyncService), sin
 * ruta propia. */
@Controller('connectors/tiendanube/catalog')
export class TiendanubeCatalogSyncController {
  constructor(private readonly catalogSyncService: TiendanubeCatalogSyncService) {}

  @Post('sync')
  sync(): Promise<{ total: number; synced: number; skipped: number }> {
    return this.catalogSyncService.syncAllPublished();
  }
}
