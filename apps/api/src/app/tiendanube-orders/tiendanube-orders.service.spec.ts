import { BadRequestException, NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import type { InventoryService } from '@plexo/inventory';
import type { ConvertTiendanubeOrderDto } from './dto/convert-tiendanube-order.dto.js';
import { TiendanubeOrdersService } from './tiendanube-orders.service.js';
import type { SalesService } from '../sales/sales.service.js';

// Same reasoning as sales.service.spec.ts: SalesService's real
// @plexo/invoicing import pulls in @react-pdf/renderer (ESM Jest/swc can't
// parse) - only the TYPE is needed here, SalesService is always mocked.
jest.mock('@plexo/invoicing', () => ({}));

function runInTenant<T>(db: Record<string, unknown>, tenantId: string, fn: () => T): T {
  return tenantContextStorage.run({ tenantId, userId: 'user-1', tx: db as never }, fn);
}

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    tenantId: 'tenant-1',
    tiendanubeStoreId: '999',
    tiendanubeOrderId: '555',
    tiendanubeOrderNumber: 42,
    status: 'PENDING_REVIEW',
    reviewReason: null,
    customerId: 'company-1',
    contactName: 'Juan Pérez',
    contactEmail: 'juan@example.com',
    contactIdentification: '20123456789',
    currency: 'ARS',
    total: '1500.00',
    lineItems: [{ sku: 'ABC-123', name: 'Remera', quantity: 2, unitPrice: '750.00', articleVariantId: 'variant-1' }],
    rawPayload: {},
    convertedAt: null,
    convertedInvoiceId: null,
    createdAt: new Date('2026-08-31'),
    updatedAt: new Date('2026-08-31'),
    ...overrides,
  };
}

function makeDb(overrides: { order?: Record<string, unknown>; currency?: Record<string, unknown> | null } = {}) {
  const order = overrides.order ?? makeOrder();
  return {
    tiendanubeOrder: {
      findUnique: jest.fn().mockResolvedValue(order),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...order, ...data })),
      findMany: jest.fn().mockResolvedValue([order]),
    },
    currency: {
      findFirst: jest.fn().mockResolvedValue(overrides.currency === undefined ? { id: 'currency-1', code: 'ARS' } : overrides.currency),
    },
  };
}

function makeSalesService(overrides: Partial<jest.Mocked<SalesService>> = {}): jest.Mocked<SalesService> {
  return { createSale: jest.fn().mockResolvedValue({ id: 'invoice-99' }), ...overrides } as unknown as jest.Mocked<SalesService>;
}

function makeInventoryService(overrides: Partial<jest.Mocked<InventoryService>> = {}): jest.Mocked<InventoryService> {
  return { recordMovement: jest.fn().mockResolvedValue({ id: 'movement-1' }), ...overrides } as unknown as jest.Mocked<InventoryService>;
}

function invoiceDto(overrides: Partial<ConvertTiendanubeOrderDto> = {}): ConvertTiendanubeOrderDto {
  return { mode: 'INVOICE', warehouseId: 'warehouse-1', branchId: 'branch-1', documentLetter: 'B', ...overrides } as ConvertTiendanubeOrderDto;
}

function stockOnlyDto(overrides: Partial<ConvertTiendanubeOrderDto> = {}): ConvertTiendanubeOrderDto {
  return { mode: 'WITHOUT_INVOICE', warehouseId: 'warehouse-1', ...overrides } as ConvertTiendanubeOrderDto;
}

describe('TiendanubeOrdersService.convert - not found', () => {
  it('throws NotFoundException for an order id that does not exist under this tenant', async () => {
    const db = makeDb();
    db.tiendanubeOrder.findUnique.mockResolvedValue(null);
    const service = new TiendanubeOrdersService(makeSalesService(), makeInventoryService());

    await expect(runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()))).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('TiendanubeOrdersService.convert - idempotency (ya CONVERTED)', () => {
  it('returns the order as-is without touching updateMany/createSale/recordMovement - fast no-op path', async () => {
    const converted = makeOrder({ status: 'CONVERTED', convertedInvoiceId: 'invoice-1', convertedAt: new Date() });
    const db = makeDb({ order: converted });
    const salesService = makeSalesService();
    const inventoryService = makeInventoryService();
    const service = new TiendanubeOrdersService(salesService, inventoryService);

    const result = await runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()));

    expect(result).toEqual(converted);
    expect(db.tiendanubeOrder.updateMany).not.toHaveBeenCalled();
    expect(salesService.createSale).not.toHaveBeenCalled();
    expect(inventoryService.recordMovement).not.toHaveBeenCalled();
  });
});

describe('TiendanubeOrdersService.convert - SKU sin mapear', () => {
  it('throws BadRequestException before touching anything (no updateMany, no createSale) when a line has no articleVariantId', async () => {
    const order = makeOrder({
      lineItems: [
        { sku: 'ABC-123', name: 'Remera', quantity: 1, unitPrice: '100.00', articleVariantId: null },
        { sku: 'XYZ-789', name: 'Buzo', quantity: 1, unitPrice: '200.00', articleVariantId: 'variant-2' },
      ],
    });
    const db = makeDb({ order });
    const salesService = makeSalesService();
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    await expect(runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()))).rejects.toThrow(
      /ABC-123/,
    );

    expect(db.tiendanubeOrder.updateMany).not.toHaveBeenCalled();
    expect(db.tiendanubeOrder.update).not.toHaveBeenCalled();
    expect(salesService.createSale).not.toHaveBeenCalled();
  });
});

describe('TiendanubeOrdersService.convert - modo INVOICE', () => {
  it('facturas con IVA incluido, usando el precio histórico del snapshot (no re-lee la API de Tiendanube)', async () => {
    const db = makeDb();
    const salesService = makeSalesService();
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    await runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()));

    expect(salesService.createSale).toHaveBeenCalledWith({
      customerId: 'company-1',
      warehouseId: 'warehouse-1',
      documentLetter: 'B',
      branchId: 'branch-1',
      currencyId: 'currency-1',
      pricesIncludeTax: true,
      lines: [{ articleVariantId: 'variant-1', quantity: 2, unitPrice: 750 }],
    });
  });

  it('claims the row (updateMany) BEFORE calling createSale - never the other order', async () => {
    const db = makeDb();
    const salesService = makeSalesService();
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    await runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()));

    const claimOrder = db.tiendanubeOrder.updateMany.mock.invocationCallOrder[0];
    const createSaleOrder = (salesService.createSale as jest.Mock).mock.invocationCallOrder[0];
    expect(claimOrder).toBeLessThan(createSaleOrder);
    expect(db.tiendanubeOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', status: 'PENDING_REVIEW' },
      data: { status: 'CONVERTED', convertedAt: expect.any(Date) },
    });
  });

  it('patches convertedInvoiceId with the created invoice id after createSale succeeds', async () => {
    const db = makeDb();
    const salesService = makeSalesService({ createSale: jest.fn().mockResolvedValue({ id: 'invoice-42' }) } as never);
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    const result = await runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()));

    expect(db.tiendanubeOrder.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { convertedInvoiceId: 'invoice-42' },
    });
    expect(result.convertedInvoiceId).toBe('invoice-42');
  });

  it('throws when the tenant has no Currency configured matching the order\'s currency code', async () => {
    const db = makeDb({ currency: null });
    const salesService = makeSalesService();
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    await expect(runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()))).rejects.toThrow(
      BadRequestException,
    );
    expect(salesService.createSale).not.toHaveBeenCalled();
  });

  it('defensively rejects an INVOICE mode call missing branchId/documentLetter even if the DTO pipeline was bypassed', async () => {
    const db = makeDb();
    const service = new TiendanubeOrdersService(makeSalesService(), makeInventoryService());

    await expect(
      runInTenant(db, 'tenant-1', () => service.convert('order-1', { mode: 'INVOICE', warehouseId: 'w-1' } as never)),
    ).rejects.toThrow(BadRequestException);
    expect(db.tiendanubeOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe('TiendanubeOrdersService.convert - modo WITHOUT_INVOICE ("crear venta sin facturar")', () => {
  it('records one SALE_OUT movement per line, never calls createSale, never looks up Currency', async () => {
    const order = makeOrder({
      lineItems: [
        { sku: 'ABC-123', name: 'Remera', quantity: 2, unitPrice: '750.00', articleVariantId: 'variant-1' },
        { sku: 'XYZ-789', name: 'Buzo', quantity: 1, unitPrice: '900.00', articleVariantId: 'variant-2' },
      ],
    });
    const db = makeDb({ order });
    const salesService = makeSalesService();
    const inventoryService = makeInventoryService();
    const service = new TiendanubeOrdersService(salesService, inventoryService);

    await runInTenant(db, 'tenant-1', () => service.convert('order-1', stockOnlyDto()));

    expect(salesService.createSale).not.toHaveBeenCalled();
    expect(db.currency.findFirst).not.toHaveBeenCalled();
    expect(inventoryService.recordMovement).toHaveBeenCalledTimes(2);
    expect(inventoryService.recordMovement).toHaveBeenNthCalledWith(1, {
      warehouseId: 'warehouse-1',
      articleVariantId: 'variant-1',
      type: 'SALE_OUT',
      quantity: 2,
      sourceType: 'TIENDANUBE_ORDER',
      sourceId: 'order-1',
    });
    expect(db.tiendanubeOrder.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { convertedInvoiceId: undefined } });
  });
});

describe('TiendanubeOrdersService.convert - createSale falla a mitad de camino (atomicidad)', () => {
  it('propagates the error and never patches convertedInvoiceId - the order was already claimed CONVERTED by the updateMany, but in production the whole HTTP transaction (TenantContextInterceptor) rolls that back too, so it lands back on PENDING_REVIEW; a mocked unit test cannot re-prove Postgres\' own rollback, only the CONTRACT this service must uphold given it: never finalize as if the sale existed', async () => {
    const db = makeDb();
    const salesService = makeSalesService({ createSale: jest.fn().mockRejectedValue(new Error('unbalanced entry')) } as never);
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    await expect(runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()))).rejects.toThrow(
      'unbalanced entry',
    );

    expect(db.tiendanubeOrder.updateMany).toHaveBeenCalledTimes(1); // the claim DID run
    expect(db.tiendanubeOrder.update).not.toHaveBeenCalled(); // the final patch never did
  });

  it('same contract for WITHOUT_INVOICE mode when recordMovement fails partway through multiple lines', async () => {
    const order = makeOrder({
      lineItems: [
        { sku: 'ABC-123', name: 'Remera', quantity: 2, unitPrice: '750.00', articleVariantId: 'variant-1' },
        { sku: 'XYZ-789', name: 'Buzo', quantity: 1, unitPrice: '900.00', articleVariantId: 'variant-2' },
      ],
    });
    const db = makeDb({ order });
    const inventoryService = makeInventoryService({
      recordMovement: jest.fn().mockResolvedValueOnce({ id: 'movement-1' }).mockRejectedValueOnce(new Error('sin stock')),
    } as never);
    const service = new TiendanubeOrdersService(makeSalesService(), inventoryService);

    await expect(runInTenant(db, 'tenant-1', () => service.convert('order-1', stockOnlyDto()))).rejects.toThrow(
      'sin stock',
    );

    expect(db.tiendanubeOrder.update).not.toHaveBeenCalled();
  });
});

describe('TiendanubeOrdersService.convert - doble conversión (concurrente o secuencial) = una sola venta', () => {
  it('a second attempt that loses the compare-and-swap (updateMany count 0) never calls createSale again and returns the SAME shape the winner left behind', async () => {
    const pending = makeOrder({ status: 'PENDING_REVIEW' });
    const converted = makeOrder({ status: 'CONVERTED', convertedInvoiceId: 'invoice-99', convertedAt: new Date('2026-08-31') });
    const db = makeDb({ order: pending });
    // Ambos intentos leen PENDING_REVIEW (la ventana de carrera real) - el
    // primero gana el updateMany (count 1), el segundo lo pierde (count 0,
    // tal como Postgres lo forzaría una vez que el primero commiteó) y
    // vuelve a leer, encontrando ya CONVERTED.
    db.tiendanubeOrder.findUnique
      .mockResolvedValueOnce(pending) // intento 1
      .mockResolvedValueOnce(pending) // intento 2 (leyó antes de que el 1 commiteara)
      .mockResolvedValueOnce(converted); // re-lectura del intento 2 tras perder la carrera
    db.tiendanubeOrder.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const salesService = makeSalesService({ createSale: jest.fn().mockResolvedValue({ id: 'invoice-99' }) } as never);
    const service = new TiendanubeOrdersService(salesService, makeInventoryService());

    const result1 = await runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()));
    const result2 = await runInTenant(db, 'tenant-1', () => service.convert('order-1', invoiceDto()));

    expect(salesService.createSale).toHaveBeenCalledTimes(1); // una sola venta, nunca dos
    expect(result1.convertedInvoiceId).toBe('invoice-99');
    // Mismo shape para ambos caminos de no-op/éxito - la UI recibe una
    // respuesta consistente gane quien gane.
    expect(Object.keys(result1).sort()).toEqual(Object.keys(result2).sort());
    expect(result2).toEqual(converted);
  });
});

describe('TiendanubeOrdersService.convert - multi-tenant', () => {
  it('two tenants converting an order with the same id never share state - each only ever touches its own mocked tenant db', async () => {
    const orderA = makeOrder({ id: 'order-1', tenantId: 'tenant-a', customerId: 'company-a' });
    const orderB = makeOrder({ id: 'order-1', tenantId: 'tenant-b', customerId: 'company-b' });
    const dbA = makeDb({ order: orderA });
    const dbB = makeDb({ order: orderB });
    const salesServiceA = makeSalesService({ createSale: jest.fn().mockResolvedValue({ id: 'invoice-a' }) } as never);
    const salesServiceB = makeSalesService({ createSale: jest.fn().mockResolvedValue({ id: 'invoice-b' }) } as never);
    const serviceA = new TiendanubeOrdersService(salesServiceA, makeInventoryService());
    const serviceB = new TiendanubeOrdersService(salesServiceB, makeInventoryService());

    await runInTenant(dbA, 'tenant-a', () => serviceA.convert('order-1', invoiceDto()));
    await runInTenant(dbB, 'tenant-b', () => serviceB.convert('order-1', invoiceDto()));

    expect(salesServiceA.createSale).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'company-a' }));
    expect(salesServiceB.createSale).toHaveBeenCalledWith(expect.objectContaining({ customerId: 'company-b' }));
    expect(dbA.tiendanubeOrder.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { convertedInvoiceId: 'invoice-a' } });
    expect(dbB.tiendanubeOrder.update).toHaveBeenCalledWith({ where: { id: 'order-1' }, data: { convertedInvoiceId: 'invoice-b' } });
    // Nunca se cruzan - dbA nunca ve la venta de B ni viceversa.
    expect(dbA.tiendanubeOrder.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { convertedInvoiceId: 'invoice-b' } }));
    expect(dbB.tiendanubeOrder.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: { convertedInvoiceId: 'invoice-a' } }));
  });
});

describe('TiendanubeOrdersService.list', () => {
  it('returns every order for the current tenant, newest first, with the customer name included', async () => {
    const db = makeDb();
    const service = new TiendanubeOrdersService(makeSalesService(), makeInventoryService());

    await runInTenant(db, 'tenant-1', () => service.list());

    expect(db.tiendanubeOrder.findMany).toHaveBeenCalledWith({
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  });
});
