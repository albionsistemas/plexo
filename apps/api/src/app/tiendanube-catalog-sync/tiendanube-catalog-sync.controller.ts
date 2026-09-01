import { Controller, Get, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import { TiendanubeCatalogSyncService } from './tiendanube-catalog-sync.service.js';

// Mismos roles que TiendanubeController.authorize/disconnect - disparar una
// sincronización masiva contra la tienda real es una acción de gestión de
// la integración, no una tarea operativa del día a día (Fase 6, checklist
// de seguridad: "guards de rol - quién conecta y sincroniza").
const SYNC_ROLES = ['OWNER', 'ADMIN'] as const;

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

  @Roles(...SYNC_ROLES)
  @Post('sync')
  sync(): Promise<{ total: number; synced: number; skipped: Array<{ articleId: string; name: string; reason: string }> }> {
    return this.catalogSyncService.syncAllPublished();
  }
}
