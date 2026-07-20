import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma.service.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

@Module({
  providers: [
    PrismaService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [PrismaService],
})
export class DatabaseModule {}
