import { createHmac } from 'node:crypto';
import { verifyTiendanubeWebhookSignature } from './tiendanube-webhook-signature.util.js';

const SECRET = 'test-app-secret';

/** Independently reconstructs the signature per Tiendanube's documented
 * scheme (hex HMAC-SHA256 of the raw body), WITHOUT reusing the SUT's own
 * logic - a test that imported the SUT's internals to build its fixture
 * wouldn't actually catch a wrong scheme. */
function realSignature(rawBody: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('verifyTiendanubeWebhookSignature', () => {
  it('accepts a correctly signed notification', () => {
    const rawBody = '{"store_id":123,"event":"order/paid","id":456}';

    const result = verifyTiendanubeWebhookSignature({
      signatureHeader: realSignature(rawBody),
      rawBody,
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const rawBody = '{"store_id":123,"event":"order/paid","id":456}';
    const signatureHeader = realSignature(rawBody);
    const tamperedBody = '{"store_id":123,"event":"order/paid","id":999}';

    const result = verifyTiendanubeWebhookSignature({
      signatureHeader,
      rawBody: tamperedBody,
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('rejects when signed with a different secret', () => {
    const rawBody = '{"store_id":123,"event":"order/paid","id":456}';

    const result = verifyTiendanubeWebhookSignature({
      signatureHeader: realSignature(rawBody, 'a-different-secret'),
      rawBody,
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('accepts a Buffer rawBody the same as an equivalent string', () => {
    const rawBody = '{"store_id":123,"event":"order/paid","id":456}';

    const result = verifyTiendanubeWebhookSignature({
      signatureHeader: realSignature(rawBody),
      rawBody: Buffer.from(rawBody, 'utf8'),
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it('rejects a missing x-linkedstore-hmac-sha256 header', () => {
    const result = verifyTiendanubeWebhookSignature({
      signatureHeader: undefined,
      rawBody: '{}',
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('never throws on garbage input (a webhook endpoint must not 500 on attacker-controlled headers)', () => {
    expect(() =>
      verifyTiendanubeWebhookSignature({
        signatureHeader: 'not-even-close-to-valid-hex-zzz',
        rawBody: '{}',
        secret: SECRET,
      }),
    ).not.toThrow();

    expect(() =>
      verifyTiendanubeWebhookSignature({
        signatureHeader: '',
        rawBody: '{}',
        secret: SECRET,
      }),
    ).not.toThrow();
  });
});
