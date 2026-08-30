import {
  MPConnectionError,
  MPDependencyError,
  MPRateLimitError,
  MPResourceLockedError,
  MPServerError,
} from 'mercadopago';

/**
 * Only for outgoing HTTP calls TO Mercado Pago (GET /v1/payments/:id,
 * POST /oauth/token refresh) - never wraps the webhook's own inbound
 * handling. No queue/Redis added for this (see PLAN_MERCADOPAGO.md Fase
 * 6 notes): a handful of retries on the couple of outbound calls this
 * integration makes is proportionate; a real queue is the next step IF
 * multiple heavy-async needs show up (large imports, bulk sends, long
 * reports), not for one webhook that MP itself already retries on a
 * non-2xx response.
 *
 * Retryable = transient by the SDK's own typed error hierarchy (network
 * blip, MP's own 5xx, rate limit, a temporarily locked idempotency key, a
 * failed internal MP dependency) - never a 4xx that means "this request
 * itself is wrong" (bad request, not found, validation, auth failure).
 * Retrying a 401 wouldn't help and would delay the REVOKED/EXPIRED
 * classification that has to happen after retries are exhausted, not
 * before (see MercadoPagoConnector.refreshIfNeeded).
 */
const RETRYABLE_ERROR_TYPES = [
  MPConnectionError,
  MPServerError,
  MPRateLimitError,
  MPResourceLockedError,
  MPDependencyError,
];

function isRetryable(err: unknown): boolean {
  return RETRYABLE_ERROR_TYPES.some((ErrorType) => err instanceof ErrorType);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface RetryOptions {
  /** Total attempts including the first - default 3 (1 try + 2 retries). */
  attempts?: number;
  /** Base delay for exponential backoff (attempt 1 waits this, attempt 2
   * waits 2x, etc). Default 300ms. */
  baseDelayMs?: number;
}

/**
 * Retries `fn` only for transient Mercado Pago errors, with exponential
 * backoff. Never swallows a final failure: if every attempt fails, or the
 * error isn't retryable, the ORIGINAL error propagates unchanged - the
 * caller (and whatever calls it, up to the webhook controller) sees
 * exactly the failure it would have seen without this wrapper, just
 * later. This is the property the whole point of retrying here depends
 * on: a webhook that still can't reach MP after retries must still end
 * in a non-2xx / WebhookEvent.processed=false, never a false "ok" that
 * papers over a real failure.
 */
export async function retryMercadoPagoCall<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 300;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt === attempts) {
        throw err;
      }
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  // Unreachable - the loop always either returns or throws above - but
  // TypeScript can't see that from a for-loop alone.
  throw new Error('retryMercadoPagoCall: unreachable');
}
