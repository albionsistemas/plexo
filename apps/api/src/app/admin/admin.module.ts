import { Module } from '@nestjs/common';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AuthModule } from '../auth/auth.module.js';
import { AdminAuditController } from './admin-audit.controller.js';
import { AdminAuditService } from './admin-audit.service.js';
import { AdminTenantsController } from './admin-tenants.controller.js';
import { AdminTenantsService } from './admin-tenants.service.js';

@Module({
  imports: [SubscriptionModule, AuthModule],
  controllers: [AdminTenantsController, AdminAuditController],
  providers: [AdminTenantsService, AdminAuditService],
})
export class AdminModule {}
