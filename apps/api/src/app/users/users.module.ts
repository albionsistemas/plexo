import { Module } from '@nestjs/common';
import { AuthEmailModule } from '@plexo/auth-email';
import { SubscriptionModule } from '@plexo/subscriptions';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [SubscriptionModule, AuthEmailModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
