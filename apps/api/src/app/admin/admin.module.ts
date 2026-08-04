import { Module } from '@nestjs/common';
import { SubscriptionModule } from '@plexo/subscriptions';
import { AdminTenantsController } from './admin-tenants.controller.js';
import { AdminTenantsService } from './admin-tenants.service.js';

@Module({
  imports: [SubscriptionModule],
  controllers: [AdminTenantsController],
  providers: [AdminTenantsService],
})
export class AdminModule {}
