import { Module } from '@nestjs/common';
import { ConnectorsModule } from '@plexo/connectors';
import { InventoryModule } from '@plexo/inventory';
import { TiendanubeModule } from '@plexo/tiendanube';
import { TiendanubeStockSyncService } from './tiendanube-stock-sync.service.js';

/** No controller - this module only reacts to `stock.updated` (see
 * TiendanubeStockSyncService), it exposes no HTTP surface of its own. */
@Module({
  imports: [TiendanubeModule, ConnectorsModule, InventoryModule],
  providers: [TiendanubeStockSyncService],
})
export class TiendanubeStockSyncModule {}
