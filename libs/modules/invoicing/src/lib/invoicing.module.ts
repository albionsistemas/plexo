import { Module } from '@nestjs/common';
import { ConsoleEmailSender } from './console-email-sender.js';
import { EMAIL_SENDER } from './email-sender.port.js';
import { ELECTRONIC_INVOICING } from './electronic-invoicing.port.js';
import { InvoicingController } from './invoicing.controller.js';
import { InvoicingService } from './invoicing.service.js';
import { StubElectronicInvoicingService } from './stub-electronic-invoicing.js';

@Module({
  controllers: [InvoicingController],
  providers: [
    InvoicingService,
    { provide: EMAIL_SENDER, useClass: ConsoleEmailSender },
    { provide: ELECTRONIC_INVOICING, useClass: StubElectronicInvoicingService },
  ],
  exports: [InvoicingService],
})
export class InvoicingModule {}
