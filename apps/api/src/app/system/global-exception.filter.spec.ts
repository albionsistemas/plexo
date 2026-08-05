import type { ArgumentsHost } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import type { SystemErrorLogService } from './system-error-log.service.js';

function makeHost(request: unknown): ArgumentsHost {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ArgumentsHost;
}

function makeAdapterHost(): HttpAdapterHost {
  return { httpAdapter: {} } as unknown as HttpAdapterHost;
}

describe('GlobalExceptionFilter', () => {
  let baseCatchSpy: jest.SpyInstance;

  beforeEach(() => {
    baseCatchSpy = jest.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
  });

  afterEach(() => {
    baseCatchSpy.mockRestore();
  });

  it('records a 5xx error with request/user context and still delegates to the base handler', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const systemErrorLogService = { record } as unknown as SystemErrorLogService;
    const filter = new GlobalExceptionFilter(systemErrorLogService, makeAdapterHost());
    const error = new Error('boom');
    const host = makeHost({
      url: '/api/dashboard',
      method: 'GET',
      user: { sub: 'user-1', tenantId: 'tenant-1' },
    });

    filter.catch(error, host);
    await Promise.resolve();

    expect(record).toHaveBeenCalledWith({
      statusCode: 500,
      message: 'boom',
      stack: error.stack,
      path: '/api/dashboard',
      method: 'GET',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });
    expect(baseCatchSpy).toHaveBeenCalledWith(error, host);
  });

  it('does not record a 4xx HttpException', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const systemErrorLogService = { record } as unknown as SystemErrorLogService;
    const filter = new GlobalExceptionFilter(systemErrorLogService, makeAdapterHost());
    const error = new HttpException('Not found', 404);
    const host = makeHost({ url: '/api/whatever', method: 'GET' });

    filter.catch(error, host);
    await Promise.resolve();

    expect(record).not.toHaveBeenCalled();
    expect(baseCatchSpy).toHaveBeenCalledWith(error, host);
  });

  it('records without a tenant/user when the request has none (e.g. a broken JWT before auth)', async () => {
    const record = jest.fn().mockResolvedValue(undefined);
    const systemErrorLogService = { record } as unknown as SystemErrorLogService;
    const filter = new GlobalExceptionFilter(systemErrorLogService, makeAdapterHost());
    const error = new Error('unexpected');
    const host = makeHost({ url: '/api/auth/login', method: 'POST' });

    filter.catch(error, host);
    await Promise.resolve();

    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: undefined, userId: undefined }),
    );
  });
});
