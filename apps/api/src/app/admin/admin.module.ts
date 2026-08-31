import { Module } from '@nestjs/common';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminMercadoPagoController } from './admin-mercadopago.controller.js';
import { AdminMercadoPagoService } from './admin-mercadopago.service.js';
import { AdminSystemStatusController } from './admin-system-status.controller.js';
import { AdminSystemStatusService } from './admin-system-status.service.js';
import { AdminTenantsController } from './admin-tenants.controller.js';
import { AdminTenantsService } from './admin-tenants.service.js';

@Module({
  imports: [SubscriptionModule, AuthModule],
  controllers: [
    AdminTenantsController,
    AdminAuditController,
    AdminMercadoPagoController,
    AdminSystemStatusController,
  ],
  providers: [AdminTenantsService, AdminAuditService, AdminMercadoPagoService, AdminSystemStatusService],
})
export class AdminModule {}
