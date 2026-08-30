import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Roles } from '@plexo/auth';
import type { PaymentIntent } from '@plexo/database';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto.js';
import { MercadoPagoPaymentService } from './mercadopago-payment.service.js';

// Same convention as apps/api's SalesController for creating/cancelling a
// sales-facing document; polling status stays open to any authenticated
// role, same as GET .../status in Fase 2.
const WRITE_ROLES = ['OWNER', 'ADMIN', 'SALES'] as const;

@Controller('connectors/mercadopago/payment-links')
export class MercadoPagoPaymentLinksController {
  constructor(private readonly paymentService: MercadoPagoPaymentService) {}

  @Roles(...WRITE_ROLES)
  @Post()
  create(@Body() dto: CreatePaymentLinkDto): Promise<PaymentIntent> {
    return this.paymentService.createPaymentLink(dto);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentIntent> {
    return this.paymentService.getPaymentLink(id);
  }

  @Roles(...WRITE_ROLES)
  @Post(':id/cancel')
  cancel(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentIntent> {
    return this.paymentService.cancelPaymentLink(id);
  }
}
