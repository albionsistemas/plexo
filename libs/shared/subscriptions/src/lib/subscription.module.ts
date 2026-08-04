import { Module } from '@nestjs/common';
import { AdminPlansController } from './admin-plans.controller.js';
import { PlansController } from './plans.controller.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { SubscriptionService } from './subscription.service.js';

@Module({
  controllers: [PlansController, SubscriptionsController, AdminPlansController],
  providers: [SubscriptionService],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
