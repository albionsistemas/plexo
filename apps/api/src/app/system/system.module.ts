import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AdminErrorsController } from './admin-errors.controller.js';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import { SystemErrorLogService } from './system-error-log.service.js';

@Module({
  controllers: [AdminErrorsController],
  providers: [SystemErrorLogService, { provide: APP_FILTER, useClass: GlobalExceptionFilter }],
})
export class SystemModule {}
