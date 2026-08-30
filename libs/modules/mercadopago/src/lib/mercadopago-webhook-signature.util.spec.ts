import { createHmac } from 'node:crypto';
import { verifyMercadoPagoWebhookSignature } from './mercadopago-webhook-signature.util.js';

const SECRET = 'test-webhook-secret';

/** Independently reconstructs the manifest/HMAC per MP's documented
 * template, WITHOUT reusing the SUT's own buildManifest - a test that
 * imported the SUT's internals to build its fixture wouldn't actually
 * catch a wrong manifest format. */
function realSignature(params: { dataId?: string; requestId?: string; ts?: string; secret?: string }): string {
  const ts = params.ts ?? '1742505638683';
  let manifest = '';
  if (params.dataId) manifest += `id:${params.dataId.toLowerCase()};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${ts};`;
  const v1 = createHmac('sha256', params.secret ?? SECRET).update(manifest).digest('hex');
  return `ts=${ts},v1=${v1}`;
}

describe('verifyMercadoPagoWebhookSignature', () => {
  it('accepts a correctly signed notification', () => {
    const signatureHeader = realSignature({ dataId: '123456', requestId: 'req-1' });

    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestId: 'req-1',
      dataId: '123456',
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it('rejects a tampered v1 hash', () => {
    const signatureHeader = realSignature({ dataId: '123456', requestId: 'req-1' });
    const tampered = signatureHeader.replace(/v1=([0-9a-f])/, (_, c) => `v1=${c === '0' ? '1' : '0'}`);

    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader: tampered,
      requestId: 'req-1',
      dataId: '123456',
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('rejects when signed with a different secret', () => {
    const signatureHeader = realSignature({ dataId: '123456', requestId: 'req-1', secret: 'wrong-secret' });

    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestId: 'req-1',
      dataId: '123456',
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('rejects when the caller-supplied dataId does not match what was signed (payload tampering)', () => {
    const signatureHeader = realSignature({ dataId: '123456', requestId: 'req-1' });

    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestId: 'req-1',
      dataId: '999999', // an attacker swapped the resource id after the fact
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('is case-insensitive on dataId (MP lowercases it in the manifest)', () => {
    const signatureHeader = realSignature({ dataId: '123456', requestId: 'req-1' });

    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestId: 'req-1',
      dataId: '123456'.toUpperCase(),
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it('omits missing manifest parts rather than leaving them blank', () => {
    // No requestId at all - the manifest must be "id:123456;ts:...;", not
    // "id:123456;request-id:;ts:...;".
    const signatureHeader = realSignature({ dataId: '123456' });

    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader,
      requestId: undefined,
      dataId: '123456',
      secret: SECRET,
    });

    expect(result).toBe(true);
  });

  it('rejects a missing x-signature header', () => {
    const result = verifyMercadoPagoWebhookSignature({
      signatureHeader: undefined,
      requestId: 'req-1',
      dataId: '123456',
      secret: SECRET,
    });

    expect(result).toBe(false);
  });

  it('rejects a malformed x-signature header (missing ts or v1)', () => {
    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: 'v1=deadbeef',
        requestId: 'req-1',
        dataId: '123456',
        secret: SECRET,
      }),
    ).toBe(false);

    expect(
      verifyMercadoPagoWebhookSignature({
        signatureHeader: 'ts=123',
        requestId: 'req-1',
        dataId: '123456',
        secret: SECRET,
      }),
    ).toBe(false);
  });

  it('never throws on garbage input (a webhook endpoint must not 500 on attacker-controlled headers)', () => {
    expect(() =>
      verifyMercadoPagoWebhookSignature({
        signatureHeader: 'not-even-close-to-valid',
        requestId: undefined,
        dataId: undefined,
        secret: SECRET,
      }),
    ).not.toThrow();

    expect(() =>
      verifyMercadoPagoWebhookSignature({
        signatureHeader: 'ts=123,v1=not-hex-at-all-zzz',
        requestId: 'req-1',
        dataId: '123456',
        secret: SECRET,
      }),
    ).not.toThrow();
  });
});
