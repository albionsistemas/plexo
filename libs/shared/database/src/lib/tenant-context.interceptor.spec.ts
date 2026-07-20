import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { getTenantId } from './tenant-context.js';
import { TenantContextInterceptor } from './tenant-context.interceptor.js';

function makeContext(user?: { tenantId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('TenantContextInterceptor', () => {
  it('skips transaction wrapping when there is no authenticated user', async () => {
    const $transaction = jest.fn();
    const interceptor = new TenantContextInterceptor({ $transaction } as never);
    const handle = jest.fn(() => of('ok'));

    const result = await lastValueFrom(
      interceptor.intercept(makeContext(undefined), { handle } as unknown as CallHandler),
    );

    expect(result).toBe('ok');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('opens a transaction, sets the tenant, and exposes it via getTenantId inside the handler', async () => {
    const executeRaw = jest.fn().mockResolvedValue(undefined);
    const fakeTx = { $executeRaw: executeRaw };
    const $transaction = jest.fn((cb: (tx: unknown) => unknown) => cb(fakeTx));
    const interceptor = new TenantContextInterceptor({ $transaction } as never);
    const handle = jest.fn(() => of(getTenantId()));

    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext({ tenantId: 'tenant-abc' }),
        { handle } as unknown as CallHandler,
      ),
    );

    expect(result).toBe('tenant-abc');
    expect(executeRaw).toHaveBeenCalled();
  });
});
