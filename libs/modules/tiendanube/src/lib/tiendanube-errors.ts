/**
 * Typed errors for TiendanubeApiClient, classified by HTTP status - there's
 * no official Node SDK for Tiendanube to borrow an error hierarchy from
 * (unlike the `mercadopago` package's MPAuthenticationError/MPServerError/
 * etc used by the MP integration), so this is the local equivalent.
 */
export class TiendanubeApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** 401/403 - either the token was never valid, or the merchant revoked
 * access. Tiendanube tokens don't expire on their own (see
 * TiendanubeConnector's doc comment), so this is the ONLY signal that a
 * stored token has gone bad. */
export class TiendanubeAuthError extends TiendanubeApiError {
  constructor(message: string, status: number) {
    super(message, status);
  }
}

/** 429 - the leaky bucket ran dry. `resetAt` (epoch ms, from the API's own
 * `x-rate-limit-reset` header) is when it's safe to try again - carried so
 * a caller that ends up seeing this (retries already exhausted in
 * TiendanubeApiClient) can decide whether to reschedule rather than just
 * fail outright. */
export class TiendanubeRateLimitError extends TiendanubeApiError {
  constructor(
    message: string,
    readonly resetAt?: number,
  ) {
    super(message, 429);
  }
}

/** 5xx from Tiendanube itself. */
export class TiendanubeServerError extends TiendanubeApiError {
  constructor(message: string, status: number) {
    super(message, status);
  }
}

/** The request never got a response at all (DNS, timeout, connection
 * refused) - no status code to classify by. */
export class TiendanubeConnectionError extends TiendanubeApiError {
  constructor(message: string) {
    super(message);
  }
}
