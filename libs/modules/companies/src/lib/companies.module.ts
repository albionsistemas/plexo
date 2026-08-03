import { Module } from '@nestjs/common';
import { AfipCredentialsModule } from '@plexo/afip-credentials';
import { AFIP_PADRON } from './afip-padron.port.js';
import { CompaniesController } from './companies.controller.js';
import { CompaniesService } from './companies.service.js';
import { PersonAvatarService } from './person-avatar.service.js';
import { RealAfipPadronService } from './real-afip-padron.js';

@Module({
  imports: [AfipCredentialsModule],
  controllers: [CompaniesController],
  providers: [
    CompaniesService,
    PersonAvatarService,
    { provide: AFIP_PADRON, useClass: RealAfipPadronService },
  ],
  exports: [CompaniesService],
})
export class CompaniesModule {}
