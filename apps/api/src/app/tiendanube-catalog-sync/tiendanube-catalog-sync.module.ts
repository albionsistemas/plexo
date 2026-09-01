import { Module } from '@nestjs/common';
import { ConnectorsModule } from '@plexo/connectors';
import { InventoryModule } from '@plexo/inventory';
import { TiendanubeModule } from '@plexo/tiendanube';
import { TiendanubeCatalogSyncController } from './tiendanube-catalog-sync.controller.js';
import { TiendanubeCatalogSyncService } from './tiendanube-catalog-sync.service.js';

@Module({
  imports: [TiendanubeModule, ConnectorsModule, InventoryModule],
  controllers: [TiendanubeCatalogSyncController],
  providers: [TiendanubeCatalogSyncService],
})
export class TiendanubeCatalogSyncModule {}
