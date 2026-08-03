import { Module } from '@nestjs/common';
import { InventoryCartController } from './inventory-cart.controller.js';
import { InventoryCartService } from './inventory-cart.service.js';
import { CartPdfService } from './pdf/cart-pdf.service.js';

@Module({
  controllers: [InventoryCartController],
  providers: [InventoryCartService, CartPdfService],
  // Exported so apps/api's inventory-cart-checkout composition module
  // (which also needs @plexo/purchases + @plexo/quotes to turn a cart into
  // a QuoteRequest/Quote) can read the current list via getCartLines()
  // without duplicating this module's queries.
  exports: [InventoryCartService],
})
export class InventoryCartModule {}
