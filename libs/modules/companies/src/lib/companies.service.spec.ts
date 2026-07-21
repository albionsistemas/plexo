import { BadRequestException, NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { CompaniesService } from './companies.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

describe('CompaniesService.createCompany', () => {
  it('creates the company with a role row per requested role', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] });
    const db = { company: { create } };
    const service = new CompaniesService();

    await runInTenant(db, () =>
      service.createCompany({ name: 'Acme', roles: ['CUSTOMER', 'SUPPLIER'] }),
    );

    const args = create.mock.calls[0][0];
    expect(args.data.name).toBe('Acme');
    expect(args.data.roles.createMany.data).toEqual([
      { tenantId: 'tenant-1', role: 'CUSTOMER' },
      { tenantId: 'tenant-1', role: 'SUPPLIER' },
    ]);
  });
});

describe('CompaniesService.updateCompany', () => {
  it('throws when the company does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService();

    await expect(
      runInTenant(db, () => service.updateCompany('missing', { name: 'x' })),
    ).rejects.toThrow(NotFoundException);
  });

  it('replaces the full role set (delete + recreate) when roles is provided', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }),
        update: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'BRANCH' }] }),
      },
      companyRole: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const service = new CompaniesService();

    await runInTenant(db, () => service.updateCompany('company-1', { roles: ['BRANCH'] }));

    expect(db.companyRole.deleteMany).toHaveBeenCalledWith({ where: { companyId: 'company-1' } });
    expect(db.companyRole.createMany).toHaveBeenCalledWith({
      data: [{ tenantId: 'tenant-1', companyId: 'company-1', role: 'BRANCH' }],
    });
  });

  it('leaves roles untouched when the dto does not mention them', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }),
        update: jest.fn().mockResolvedValue({ id: 'company-1', roles: [] }),
      },
      companyRole: { deleteMany: jest.fn(), createMany: jest.fn() },
    };
    const service = new CompaniesService();

    await runInTenant(db, () => service.updateCompany('company-1', { name: 'New name' }));

    expect(db.companyRole.deleteMany).not.toHaveBeenCalled();
    expect(db.companyRole.createMany).not.toHaveBeenCalled();
  });
});

describe('CompaniesService.createPerson', () => {
  it('throws when the company does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService();

    await expect(
      runInTenant(db, () =>
        service.createPerson({ companyId: 'missing', firstName: 'Ana' }),
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects a contact for a company that is only a BRANCH', async () => {
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'BRANCH' }] }),
      },
    };
    const service = new CompaniesService();

    await expect(
      runInTenant(db, () =>
        service.createPerson({ companyId: 'company-1', firstName: 'Ana' }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows a contact for a CUSTOMER company', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'person-1', firstName: 'Ana' });
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] }),
      },
      person: { create },
    };
    const service = new CompaniesService();

    await runInTenant(db, () =>
      service.createPerson({ companyId: 'company-1', firstName: 'Ana', lastName: 'García' }),
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        companyId: 'company-1',
        firstName: 'Ana',
        lastName: 'García',
      }),
    });
  });
});
