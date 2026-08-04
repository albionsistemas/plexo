import { Controller, Get } from '@nestjs/common';
import { SubscriptionService } from './subscription.service.js';

// Auth normal, sin @Roles - cualquier usuario logueado necesita esto para
// que el frontend pueda mostrar el banner de trial, no sólo OWNER/ADMIN.
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get('me')
  getCurrent() {
    return this.subscriptionService.getCurrentForTenant();
  }
}
