import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyTiendanubeWebhookSignatureInput {
  /** Raw `x-linkedstore-hmac-sha256` header. */
  signatureHeader: string | undefined;
  /** The EXACT raw request body bytes, not the re-parsed/re-serialized
   * JSON - Tiendanube signs the bytes it sent, and re-serializing (even
   * with identical field values) can change byte-for-byte output (key
   * order, whitespace), which would make a genuinely valid notification
   * fail verification. See main.ts's content-type parser override, which
   * exists specifically to capture this. */
  rawBody: Buffer | string;
  /** The app's secret (TIENDANUBE_CLIENT_SECRET, the same one used for the
   * OAuth token exchange) - confirmed against the official doc: Tiendanube
   * doesn't have a separate webhook-only secret like Mercado Pago does. */
  secret: string;
}

/**
 * HMAC-SHA256 validation of a Tiendanube webhook notification, per the
 * official doc (verified, not guessed): unlike Mercado Pago's manifest-
 * string scheme (`id:...;request-id:...;ts:...;`), Tiendanube signs the
 * RAW REQUEST BODY BYTES directly - `hash_hmac('sha256', $raw_body,
 * $secret)`, hex-encoded, compared against the `x-linkedstore-hmac-sha256`
 * header.
 *
 * Returns false (never throws) for anything malformed - a webhook endpoint
 * should never 500 on attacker-controlled input, an invalid signature IS
 * the "reject" outcome, not an error. Same convention as
 * verifyMercadoPagoWebhookSignature.
 */
export function verifyTiendanubeWebhookSignature(input: VerifyTiendanubeWebhookSignatureInput): boolean {
  if (!input.signatureHeader) {
    return false;
  }
  const expected = createHmac('sha256', input.secret).update(input.rawBody).digest('hex');
  return timingSafeCompareHex(expected, input.signatureHeader);
}

/** Constant-time comparison, but only once both sides are confirmed the
 * same length (timingSafeEqual throws on a length mismatch, which an
 * attacker-controlled header could easily trigger - that itself must not
 * leak via a thrown-vs-returned-false difference in caller behavior, so
 * this always returns a boolean, never throws). `Buffer.from(x, 'hex')`
 * never throws on malformed hex either (it just stops at the first invalid
 * character, producing a shorter buffer) - the length check below already
 * catches that case. */
function timingSafeCompareHex(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  if (expected.length !== received.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
