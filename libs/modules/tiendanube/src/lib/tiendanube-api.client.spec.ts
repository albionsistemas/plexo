import { TiendanubeApiClient } from './tiendanube-api.client.js';
import { TiendanubeConfigService } from './tiendanube-config.service.js';
import { TiendanubeAuthError, TiendanubeConnectionError, TiendanubeRateLimitError, TiendanubeServerError } from './tiendanube-errors.js';

const originalFetch = global.fetch;

function makeConfig(): TiendanubeConfigService {
  const config = new TiendanubeConfigService();
  jest.spyOn(config, 'userAgent', 'get').mockReturnValue('OPLEX (soporte@oplex.com.ar)');
  return config;
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    headers: new Headers(init.headers ?? {}),
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('TiendanubeApiClient.request', () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('builds the store-scoped URL with the versioned base and required headers', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const client = new TiendanubeApiClient(makeConfig());

    await client.request({
      connectorId: 'conn-1',
      storeId: '999',
      accessToken: 'tok-abc',
      method: 'GET',
      path: '/store',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.tiendanube.com/2025-03/999/store');
    expect(init.headers['Authorization']).toBe('Bearer tok-abc');
    expect(init.headers['User-Agent']).toBe('OPLEX (soporte@oplex.com.ar)');
    expect(init.headers['Content-Type']).toBeUndefined();
  });

  it('sends Content-Type and a JSON body for a write with a body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 1 }));
    const client = new TiendanubeApiClient(makeConfig());

    await client.request({
      connectorId: 'conn-1',
      storeId: '999',
      accessToken: 'tok-abc',
      method: 'PUT',
      path: '/products/1/variants/2',
      body: { stock: 5 },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['Content-Type']).toBe('application/json; charset=utf-8');
    expect(init.body).toBe(JSON.stringify({ stock: 5 }));
  });

  it('appends query params to the URL', async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    const client = new TiendanubeApiClient(makeConfig());

    await client.request({
      connectorId: 'conn-1',
      storeId: '999',
      accessToken: 'tok-abc',
      method: 'GET',
      path: '/orders',
      query: { status: 'paid', page: '2' },
    });

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.tiendanube.com/2025-03/999/orders?status=paid&page=2');
  });

  it('returns undefined for a 204 response instead of trying to parse an empty body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(undefined, { status: 204 }));
    const client = new TiendanubeApiClient(makeConfig());

    const result = await client.request({
      connectorId: 'conn-1',
      storeId: '999',
      accessToken: 'tok-abc',
      method: 'DELETE',
      path: '/products/1',
    });

    expect(result).toBeUndefined();
  });

  it('serializes two calls for the same connectorId - the second never starts before the first resolves', async () => {
    const order: string[] = [];
    let resolveFirst!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => {
      order.push('first-sent');
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    });
    fetchMock.mockImplementationOnce(() => {
      order.push('second-sent');
      return Promise.resolve(jsonResponse({}));
    });
    const client = new TiendanubeApiClient(makeConfig());

    const first = client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' });
    const second = client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/b' });

    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(['first-sent']); // second hasn't been sent yet - still queued

    resolveFirst(jsonResponse({}));
    await first;
    await second;

    expect(order).toEqual(['first-sent', 'second-sent']);
  });

  it('does not serialize calls for different connectorIds', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const client = new TiendanubeApiClient(makeConfig());

    await Promise.all([
      client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' }),
      client.request({ connectorId: 'conn-2', storeId: '888', accessToken: 't', method: 'GET', path: '/b' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('paces the next call for the same connector once x-rate-limit-remaining hits 0, using x-rate-limit-reset', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({}, { headers: { 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': '500' } }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    const client = new TiendanubeApiClient(makeConfig());

    await client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' });
    const second = client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/b' });

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1); // second is waiting out the reset window

    await jest.advanceTimersByTimeAsync(500);
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not throttle when remaining is still above 0', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({}, { headers: { 'x-rate-limit-remaining': '39', 'x-rate-limit-reset': '500' } }),
    );
    const client = new TiendanubeApiClient(makeConfig());

    await client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' });
    await client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/b' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries a 429 respecting x-rate-limit-reset and eventually succeeds', async () => {
    jest.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({}, { status: 429, headers: { 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': '200' } }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new TiendanubeApiClient(makeConfig());

    const promise = client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' });

    await Promise.resolve(); // let the first attempt run
    await jest.advanceTimersByTimeAsync(200);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws TiendanubeRateLimitError after exhausting retries on a persistent 429 - never swallows it', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(
      jsonResponse({}, { status: 429, headers: { 'x-rate-limit-remaining': '0', 'x-rate-limit-reset': '10' } }),
    );
    const client = new TiendanubeApiClient(makeConfig());

    const promise = client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' });
    const assertion = expect(promise).rejects.toBeInstanceOf(TiendanubeRateLimitError);

    await Promise.resolve(); // let the first attempt run
    await jest.advanceTimersByTimeAsync(10);
    await jest.advanceTimersByTimeAsync(10);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws TiendanubeAuthError immediately on 401 - never retries an auth failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 401 }));
    const client = new TiendanubeApiClient(makeConfig());

    await expect(
      client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' }),
    ).rejects.toBeInstanceOf(TiendanubeAuthError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a 5xx with backoff, then throws TiendanubeServerError once attempts are exhausted', async () => {
    jest.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({}, { status: 503 }));
    const client = new TiendanubeApiClient(makeConfig());

    const promise = client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' });
    const assertion = expect(promise).rejects.toBeInstanceOf(TiendanubeServerError);

    await Promise.resolve(); // let the first attempt run
    await jest.advanceTimersByTimeAsync(300);
    await jest.advanceTimersByTimeAsync(600);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('throws TiendanubeConnectionError without retrying when fetch itself rejects (network failure)', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = new TiendanubeApiClient(makeConfig());

    await expect(
      client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' }),
    ).rejects.toBeInstanceOf(TiendanubeConnectionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('a failed call never wedges the queue - a later call for the same connector still goes through', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, { status: 401 })).mockResolvedValueOnce(jsonResponse({ ok: true }));
    const client = new TiendanubeApiClient(makeConfig());

    await expect(
      client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/a' }),
    ).rejects.toBeInstanceOf(TiendanubeAuthError);

    const result = await client.request({ connectorId: 'conn-1', storeId: '999', accessToken: 't', method: 'GET', path: '/b' });
    expect(result).toEqual({ ok: true });
  });
});
