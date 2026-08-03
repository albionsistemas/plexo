import { Module } from '@nestjs/common';
import { PurchasesModule } from '@plexo/purchases';
import { QuotesModule } from '@plexo/quotes';
import { InventoryCartCheckoutController } from './inventory-cart-checkout.controller.js';
import { InventoryCartCheckoutService } from './inventory-cart-checkout.service.js';

@Module({
  imports: [PurchasesModule, QuotesModule],
  controllers: [InventoryCartCheckoutController],
  providers: [InventoryCartCheckoutService],
})
export class InventoryCartCheckoutModule {}
