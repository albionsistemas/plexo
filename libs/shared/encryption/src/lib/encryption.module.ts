import { Global, Module } from '@nestjs/common';
import { EncryptionService } from './encryption.service.js';

// Global like DatabaseModule: every module that stores a tenant secret
// (companies/AFIP today, tenant-settings/bank+MP later) needs this, so
// requiring an explicit import everywhere is just a way to forget one.
@Global()
@Module({
  providers: [EncryptionService],
  exports: [EncryptionService],
})
export class EncryptionModule {}
