import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ModuleAccessGuard, RolesGuard } from '@plexo/auth';
import { DatabaseModule } from '@plexo/database';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [DatabaseModule],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
export class AppModule {}
