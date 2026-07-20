import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaService } from './prisma.service.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

// Global: AuthService (in apps/api's own AuthModule, not this lib) injects
// PrismaService directly - it runs withTenantContext() itself, before any
// tenant context exists, so it can't go through getTenantDb(). Without
// @Global() here, only modules that explicitly import DatabaseModule would
// see PrismaService, and this is exactly the kind of cross-cutting
// dependency (like JwtModule) that's easy to forget to wire into a new
// module - a unit test won't catch it either, since constructing a service
// with `new` bypasses Nest's DI container entirely.
@Global()
@Module({
  providers: [
    PrismaService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
  exports: [PrismaService],
})
export class DatabaseModule {}
