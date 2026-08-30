import { Injectable } from '@nestjs/common';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import type { PaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes.js';

/**
 * Thin wrapper around the SDK's Payment client - only `.get()` (the
 * webhook's follow-up `GET /v1/payments/:id`, since the notification
 * itself never carries a trustworthy final status - see plan section
 * 4.1/4.4). Same per-call-accessToken reasoning as
 * MercadoPagoPreferenceClient: this always authenticates as the TENANT
 * whose payment is being looked up, never OPLEX's own platform account.
 */
@Injectable()
export class MercadoPagoPaymentClient {
  /** Throws (a MercadoPagoError subtype) on a non-2xx response - same
   * behavior already confirmed for OAuth/Preference. */
  getPayment(tenantAccessToken: string, paymentId: string): Promise<PaymentResponse> {
    const payment = new Payment(new MercadoPagoConfig({ accessToken: tenantAccessToken }));
    return payment.get({ id: paymentId });
  }
}
