import { createHmac, timingSafeEqual } from 'node:crypto';

export interface VerifyWebhookSignatureInput {
  /** Raw `x-signature` header, e.g. "ts=1742505638683,v1=ced36ab6...". */
  signatureHeader: string | undefined;
  /** Raw `x-request-id` header. */
  requestId: string | undefined;
  /** `data.id` from the notification (body or query) - the resource id. */
  dataId: string | undefined;
  secret: string;
}

/**
 * HMAC-SHA256 validation of a Mercado Pago webhook notification, per the
 * official manifest template (verified against MP's current docs, not
 * guessed - the installed SDK doesn't expose this itself):
 *
 *   id:{data.id};request-id:{x-request-id};ts:{ts};
 *
 * - `data.id` is lowercased in the manifest.
 * - Any of the three parts whose value is missing is OMITTED entirely
 *   (not left blank) - MP's docs are explicit about this.
 * - `ts` comes from the `x-signature` header itself, not the request.
 *
 * Returns false (never throws) for anything malformed - a webhook
 * endpoint should never 500 on attacker-controlled input, an invalid
 * signature IS the "reject" outcome, not an error.
 */
export function verifyMercadoPagoWebhookSignature(input: VerifyWebhookSignatureInput): boolean {
  const parsed = parseSignatureHeader(input.signatureHeader);
  if (!parsed) {
    return false;
  }
  const { ts, v1 } = parsed;

  const manifest = buildManifest({ dataId: input.dataId, requestId: input.requestId, ts });
  const expected = createHmac('sha256', input.secret).update(manifest).digest('hex');

  return timingSafeCompareHex(expected, v1);
}

function parseSignatureHeader(header: string | undefined): { ts: string; v1: string } | undefined {
  if (!header) {
    return undefined;
  }
  const parts = Object.fromEntries(
    header
      .split(',')
      .map((part) => part.trim().split('=', 2))
      .filter((pair): pair is [string, string] => pair.length === 2)
      .map(([key, value]) => [key.trim(), value.trim()]),
  );
  if (!parts['ts'] || !parts['v1']) {
    return undefined;
  }
  return { ts: parts['ts'], v1: parts['v1'] };
}

function buildManifest(parts: { dataId: string | undefined; requestId: string | undefined; ts: string }): string {
  let manifest = '';
  if (parts.dataId) {
    manifest += `id:${parts.dataId.toLowerCase()};`;
  }
  if (parts.requestId) {
    manifest += `request-id:${parts.requestId};`;
  }
  manifest += `ts:${parts.ts};`;
  return manifest;
}

/** Constant-time comparison, but only once both sides are confirmed the
 * same length (timingSafeEqual throws on a length mismatch, which an
 * attacker-controlled v1 could easily trigger - that itself must not
 * leak via a thrown-vs-returned-false difference in caller behavior, so
 * this always returns a boolean, never throws). */
function timingSafeCompareHex(expectedHex: string, receivedHex: string): boolean {
  const expected = Buffer.from(expectedHex, 'hex');
  const received = Buffer.from(receivedHex, 'hex');
  if (expected.length !== received.length || expected.length === 0) {
    return false;
  }
  return timingSafeEqual(expected, received);
}
