import {
  MPAuthenticationError,
  MPConnectionError,
  MPForbiddenError,
  MPNotFoundError,
  MPRateLimitError,
  MPServerError,
} from 'mercadopago';
import { retryMercadoPagoCall } from './mercadopago-retry.util.js';

function errorBody() {
  return { status: 0, message: 'boom' };
}

describe('retryMercadoPagoCall', () => {
  it('returns the result on the first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue('ok');

    const result = await retryMercadoPagoCall(fn, { baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient MPServerError and succeeds on a later attempt', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new MPServerError(errorBody()))
      .mockRejectedValueOnce(new MPServerError(errorBody()))
      .mockResolvedValue('ok');

    const result = await retryMercadoPagoCall(fn, { attempts: 3, baseDelayMs: 1 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries MPConnectionError and MPRateLimitError the same way', async () => {
    for (const err of [new MPConnectionError(new Error('ECONNRESET')), new MPRateLimitError(errorBody())]) {
      const fn = jest.fn().mockRejectedValueOnce(err).mockResolvedValue('ok');

      const result = await retryMercadoPagoCall(fn, { baseDelayMs: 1 });

      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(2);
    }
  });

  it('gives up and rethrows the ORIGINAL error once attempts are exhausted - never swallows a persistent transient failure', async () => {
    const persistent = new MPServerError(errorBody());
    const fn = jest.fn().mockRejectedValue(persistent);

    await expect(retryMercadoPagoCall(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBe(persistent);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('never retries a 401 (MPAuthenticationError) - fails on the first attempt', async () => {
    const authError = new MPAuthenticationError(errorBody());
    const fn = jest.fn().mockRejectedValue(authError);

    await expect(retryMercadoPagoCall(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBe(authError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('never retries a 403 (MPForbiddenError) or a 404 (MPNotFoundError)', async () => {
    for (const err of [new MPForbiddenError(errorBody()), new MPNotFoundError(errorBody())]) {
      const fn = jest.fn().mockRejectedValue(err);

      await expect(retryMercadoPagoCall(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBe(err);
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it('retries a plain non-MercadoPagoError never (not in the retryable type list) - fails fast', async () => {
    const genericError = new Error('something unrelated broke');
    const fn = jest.fn().mockRejectedValue(genericError);

    await expect(retryMercadoPagoCall(fn, { attempts: 3, baseDelayMs: 1 })).rejects.toBe(genericError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially between retries', async () => {
    jest.useFakeTimers();
    try {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new MPServerError(errorBody()))
        .mockRejectedValueOnce(new MPServerError(errorBody()))
        .mockResolvedValue('ok');

      const promise = retryMercadoPagoCall(fn, { attempts: 3, baseDelayMs: 100 });

      await Promise.resolve(); // let the first attempt run
      expect(fn).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(100); // 100ms * 2^0
      expect(fn).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(200); // 100ms * 2^1
      expect(fn).toHaveBeenCalledTimes(3);

      await expect(promise).resolves.toBe('ok');
    } finally {
      jest.useRealTimers();
    }
  });
});
