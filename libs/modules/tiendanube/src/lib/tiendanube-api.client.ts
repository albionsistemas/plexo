import { Injectable, Logger } from '@nestjs/common';
import { TiendanubeConfigService } from './tiendanube-config.service.js';
import {
  TiendanubeApiError,
  TiendanubeAuthError,
  TiendanubeConnectionError,
  TiendanubeRateLimitError,
  TiendanubeServerError,
} from './tiendanube-errors.js';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface TiendanubeRequest {
  /** Which tenant's connection this call is paced/serialized under - the
   * rate limit bucket belongs to the STORE (via its access token), so two
   * concurrent calls for the same connector must never race past each
   * other's pacing. */
  connectorId: string;
  storeId: string;
  accessToken: string;
  method: HttpMethod;
  /** Starts with "/", e.g. "/store", "/products/123". */
  path: string;
  query?: Record<string, string>;
  body?: unknown;
}

/** Per-connector pacing state: `tail` serializes every call through a
 * single promise chain (a plain FIFO, no queue library - same criterion
 * already fixed for Mercado Pago's hardening: no Redis/BullMQ for this),
 * `nextAvailableAt` is when the bucket is expected to have room again,
 * learned from the API's own response headers rather than an algorithm
 * this client reimplements. */
interface Queue {
  tail: Promise<unknown>;
  nextAvailableAt: number;
}

const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generic HTTP client for Tiendanube's REST API, shared by every future
 * sync (orders, stock, catalog - Fases 2-4). Central concern: Tiendanube's
 * leaky-bucket rate limit (confirmed against the official doc: capacity 40,
 * drains 2 req/s for standard stores, x10 for Next/Evolution stores) - this
 * client never hardcodes those numbers, it reads `x-rate-limit-remaining`/
 * `x-rate-limit-reset` off each response and paces the NEXT call
 * accordingly, so it self-adjusts to whatever plan a given store actually
 * has.
 */
@Injectable()
export class TiendanubeApiClient {
  private readonly logger = new Logger(TiendanubeApiClient.name);
  private readonly queues = new Map<string, Queue>();

  constructor(private readonly config: TiendanubeConfigService) {}

  private queueFor(connectorId: string): Queue {
    let queue = this.queues.get(connectorId);
    if (!queue) {
      queue = { tail: Promise.resolve(), nextAvailableAt: 0 };
      this.queues.set(connectorId, queue);
    }
    return queue;
  }

  /**
   * Enqueues `params` behind every other in-flight call for the same
   * connectorId and returns a promise for its result. A failed call never
   * wedges the queue for calls behind it - the chain always continues past
   * a rejection, only the caller of THIS call sees the error.
   */
  request<T>(params: TiendanubeRequest): Promise<T> {
    const queue = this.queueFor(params.connectorId);
    const run = queue.tail.then(() => this.throttledSend<T>(params, queue));
    queue.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async throttledSend<T>(params: TiendanubeRequest, queue: Queue): Promise<T> {
    const wait = queue.nextAvailableAt - Date.now();
    if (wait > 0) {
      await sleep(wait);
    }
    return this.sendWithRetry<T>(params, queue, 1);
  }

  private async sendWithRetry<T>(params: TiendanubeRequest, queue: Queue, attempt: number): Promise<T> {
    const url = new URL(`${this.config.apiBaseUrl(params.storeId)}${params.path}`);
    if (params.query) {
      for (const [key, value] of Object.entries(params.query)) {
        url.searchParams.set(key, value);
      }
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${params.accessToken}`,
      'User-Agent': this.config.userAgent as string,
    };
    if (params.body !== undefined) {
      headers['Content-Type'] = 'application/json; charset=utf-8';
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: params.method,
        headers,
        body: params.body !== undefined ? JSON.stringify(params.body) : undefined,
      });
    } catch (err) {
      // Never retried - a DNS/connection failure isn't paced by a rate
      // limit header we never got, and retrying blindly here would just
      // hammer a host that may genuinely be unreachable.
      throw new TiendanubeConnectionError(`No se pudo conectar con la API de Tiendanube: ${err}`);
    }

    this.updatePacing(queue, response);

    if (response.status === 429) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new TiendanubeRateLimitError(
          'Tiendanube devolvió 429 (límite de llamadas agotado) tras reintentar',
          queue.nextAvailableAt || undefined,
        );
      }
      const wait = queue.nextAvailableAt - Date.now();
      if (wait > 0) {
        await sleep(wait);
      }
      return this.sendWithRetry<T>(params, queue, attempt + 1);
    }

    if (response.status === 401 || response.status === 403) {
      throw new TiendanubeAuthError(
        `Tiendanube rechazó las credenciales (status ${response.status}) - el token puede haber sido revocado`,
        response.status,
      );
    }

    if (response.status >= 500) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new TiendanubeServerError(`Tiendanube respondió ${response.status} tras reintentar`, response.status);
      }
      this.logger.warn(`Tiendanube respondió ${response.status} (intento ${attempt}/${MAX_ATTEMPTS}) - reintentando`);
      await sleep(300 * 2 ** (attempt - 1));
      return this.sendWithRetry<T>(params, queue, attempt + 1);
    }

    if (!response.ok) {
      throw new TiendanubeApiError(`Tiendanube respondió ${response.status}`, response.status);
    }

    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  /** Only tightens pacing when the bucket is actually empty
   * (`remaining <= 0`) - a request that still has budget left shouldn't be
   * delayed just because we now know the limit, that would throttle well
   * below what the store's plan actually allows. */
  private updatePacing(queue: Queue, response: Response): void {
    const remaining = Number(response.headers.get('x-rate-limit-remaining'));
    const resetMs = Number(response.headers.get('x-rate-limit-reset'));
    if (Number.isFinite(remaining) && Number.isFinite(resetMs) && remaining <= 0) {
      queue.nextAvailableAt = Date.now() + resetMs;
    }
  }
}
