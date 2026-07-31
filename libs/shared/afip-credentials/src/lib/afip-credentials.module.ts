import { Module } from '@nestjs/common';
import { AfipCredentialsService } from './afip-credentials.service.js';

// Not @Global() - only companies (padrón) and invoicing (WSFE) need this,
// unlike DatabaseModule/EncryptionModule which everything touches.
@Module({
  providers: [AfipCredentialsService],
  exports: [AfipCredentialsService],
})
export class AfipCredentialsModule {}
