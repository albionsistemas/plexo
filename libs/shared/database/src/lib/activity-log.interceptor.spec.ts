import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ActivityLogInterceptor } from './activity-log.interceptor.js';

function makeReflector(returnValue: unknown): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(returnValue) } as unknown as Reflector;
}

function makeContext(options: {
  method: string;
  url?: string;
  user?: { sub: string; tenantId: string };
  params?: Record<string, string>;
}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method: options.method,
        url: options.url ?? '/companies/c-1',
        user: options.user,
        params: options.params ?? {},
        ip: '190.1.2.3',
        headers: { 'user-agent': 'test-agent' },
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('ActivityLogInterceptor', () => {
  it('skips entirely when there is no authenticated tenant user', async () => {
    const $transaction = jest.fn();
    const interceptor = new ActivityLogInterceptor({ $transaction } as never, makeReflector(undefined));
    const handle = jest.fn(() => of('ok'));

    const result = await lastValueFrom(
      interceptor.intercept(makeContext({ method: 'PATCH' }), { handle } as unknown as CallHandler),
    );

    expect(result).toBe('ok');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('records a plain "METHOD /url" action for undecorated routes (regression guard)', async () => {
    const create = jest.fn().mockResolvedValue({});
    const fakeTx = { $executeRaw: jest.fn(), userActivityLog: { create } };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const interceptor = new ActivityLogInterceptor({ $transaction } as never, makeReflector(undefined));
    const handle = jest.fn(() => of({ id: 'c-1', name: 'Acme' }));

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ method: 'PATCH', user: { sub: 'user-1', tenantId: 'tenant-1' } }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PATCH /companies/c-1',
          entityType: undefined,
          changes: undefined,
        }),
      }),
    );
  });

  it('fetches the before snapshot and diffs it against the handler result for a decorated route', async () => {
    const before = { id: 'c-1', tenantId: 'tenant-1', name: 'Acme', taxId: '20-111' };
    const after = { id: 'c-1', tenantId: 'tenant-1', name: 'Acme', taxId: '20-222' };
    const findUnique = jest.fn().mockResolvedValue(before);
    const create = jest.fn().mockResolvedValue({});
    const fakeTx = { $executeRaw: jest.fn(), company: { findUnique }, userActivityLog: { create } };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const auditMeta = { modelName: 'company', idParam: 'id', labelFields: ['name'] };
    const interceptor = new ActivityLogInterceptor({ $transaction } as never, makeReflector(auditMeta));
    const handle = jest.fn(() => of(after));

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ method: 'PATCH', params: { id: 'c-1' }, user: { sub: 'user-1', tenantId: 'tenant-1' } }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect(findUnique).toHaveBeenCalledWith({ where: { id: 'c-1' } });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'company.updated',
          entityType: 'company',
          entityId: 'c-1',
          entityLabel: 'Acme',
          changes: { taxId: { from: '20-111', to: '20-222' } },
        }),
      }),
    );
  });

  it('looks up a singleton entity (idParam: null) by tenantId instead of a route param', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const create = jest.fn().mockResolvedValue({});
    const fakeTx = { $executeRaw: jest.fn(), tenantSettings: { findUnique }, userActivityLog: { create } };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const auditMeta = { modelName: 'tenantSettings', idParam: null };
    const interceptor = new ActivityLogInterceptor({ $transaction } as never, makeReflector(auditMeta));
    const handle = jest.fn(() => of({ tenantId: 'tenant-1', emailSenderMode: 'SHARED' }));

    await lastValueFrom(
      interceptor.intercept(
        makeContext({ method: 'PATCH', url: '/tenant-settings', user: { sub: 'user-1', tenantId: 'tenant-1' } }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect(findUnique).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
  });

  it('never records a diff on FAILURE, even for a decorated route', async () => {
    const before = { id: 'c-1', name: 'Acme' };
    const findUnique = jest.fn().mockResolvedValue(before);
    const create = jest.fn().mockResolvedValue({});
    const fakeTx = { $executeRaw: jest.fn(), company: { findUnique }, userActivityLog: { create } };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const auditMeta = { modelName: 'company', idParam: 'id', labelFields: ['name'] };
    const interceptor = new ActivityLogInterceptor({ $transaction } as never, makeReflector(auditMeta));
    const failure = new Error('boom');
    const handle = jest.fn(() => throwError(() => failure));

    await expect(
      lastValueFrom(
        interceptor.intercept(
          makeContext({ method: 'PATCH', params: { id: 'c-1' }, user: { sub: 'user-1', tenantId: 'tenant-1' } }),
          { handle } as unknown as CallHandler,
        ),
      ),
    ).rejects.toThrow('boom');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'FAILURE', changes: undefined, errorMessage: 'boom' }),
      }),
    );
  });

  it('degrades to a null "before" without failing the request when the pre-fetch throws', async () => {
    const findUnique = jest.fn().mockRejectedValue(new Error('bad model name'));
    const create = jest.fn().mockResolvedValue({});
    const fakeTx = { $executeRaw: jest.fn(), company: { findUnique }, userActivityLog: { create } };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const auditMeta = { modelName: 'company', idParam: 'id' };
    const interceptor = new ActivityLogInterceptor({ $transaction } as never, makeReflector(auditMeta));
    const handle = jest.fn(() => of({ id: 'c-1', name: 'Acme' }));

    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext({ method: 'PATCH', params: { id: 'c-1' }, user: { sub: 'user-1', tenantId: 'tenant-1' } }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect(result).toEqual({ id: 'c-1', name: 'Acme' });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ changes: { name: { from: null, to: 'Acme' } } }),
      }),
    );
  });
});
