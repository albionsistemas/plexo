import QRCode from 'qrcode';

/** PNG data-URI encoding the MP payment link (`init_point`) - same shape
 * and library call as invoicing's buildAfipQrDataUri (AFIP RG 4892 QR),
 * directly usable in an <img src>/<Image src> without writing a file. */
export function buildPaymentLinkQrDataUri(initPoint: string): Promise<string> {
  return QRCode.toDataURL(initPoint, { margin: 1, width: 300 });
}
