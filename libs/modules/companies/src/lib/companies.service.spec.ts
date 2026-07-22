import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import { tenantContextStorage } from '@plexo/database';
import { AfipLookupError, AfipNotConfiguredError, type AfipPadronPort } from './afip-padron.port.js';
import { CompaniesService } from './companies.service.js';

function runInTenant<T>(db: Record<string, unknown>, fn: () => T): T {
  return tenantContextStorage.run({ tenantId: 'tenant-1', userId: 'user-1', tx: db as never }, fn);
}

const stubAfipPadron: AfipPadronPort = { lookup: jest.fn() };

describe('CompaniesService.createCompany', () => {
  it('creates the company with a role row per requested role', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'company-1', roles: [{ role: 'CUSTOMER' }] });
    const db = { company: { create } };
    const service = new CompaniesService(stubAfipPadron);

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
    const service = new CompaniesService(stubAfipPadron);

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
    const service = new CompaniesService(stubAfipPadron);

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
    const service = new CompaniesService(stubAfipPadron);

    await runInTenant(db, () => service.updateCompany('company-1', { name: 'New name' }));

    expect(db.companyRole.deleteMany).not.toHaveBeenCalled();
    expect(db.companyRole.createMany).not.toHaveBeenCalled();
  });

  it('deactivates a company (soft delete) by setting active: false', async () => {
    const update = jest.fn().mockResolvedValue({ id: 'company-1', active: false });
    const db = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'company-1' }),
        update,
      },
    };
    const service = new CompaniesService(stubAfipPadron);

    await runInTenant(db, () => service.updateCompany('company-1', { active: false }));

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ active: false }) }),
    );
  });
});

describe('CompaniesService.createPerson', () => {
  it('throws when the company does not exist', async () => {
    const db = { company: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService(stubAfipPadron);

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
    const service = new CompaniesService(stubAfipPadron);

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
    const service = new CompaniesService(stubAfipPadron);

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

describe('CompaniesService.lookupAfip', () => {
  beforeEach(() => {
    (stubAfipPadron.lookup as jest.Mock).mockReset();
  });

  it('rejects an invalid CUIT without calling AFIP', async () => {
    const service = new CompaniesService(stubAfipPadron);

    await expect(service.lookupAfip('20123456780')).rejects.toThrow(BadRequestException);
    expect(stubAfipPadron.lookup).not.toHaveBeenCalled();
  });

  it('maps AfipNotConfiguredError to a 400 with a clear message', async () => {
    (stubAfipPadron.lookup as jest.Mock).mockRejectedValue(new AfipNotConfiguredError());
    const service = new CompaniesService(stubAfipPadron);

    await expect(service.lookupAfip('20123456786')).rejects.toThrow(BadRequestException);
  });

  it('maps AfipLookupError (AFIP unreachable/erroring) to a 502', async () => {
    (stubAfipPadron.lookup as jest.Mock).mockRejectedValue(new AfipLookupError('AFIP no responde'));
    const service = new CompaniesService(stubAfipPadron);

    await expect(service.lookupAfip('20123456786')).rejects.toThrow(BadGatewayException);
  });

  it('maps a null result (AFIP has no record) to a 404', async () => {
    (stubAfipPadron.lookup as jest.Mock).mockResolvedValue(null);
    const service = new CompaniesService(stubAfipPadron);

    await expect(service.lookupAfip('20123456786')).rejects.toThrow(NotFoundException);
  });

  it('returns the padrón data on success, normalizing the CUIT first', async () => {
    const data = {
      cuit: '20123456786',
      personType: 'JURIDICA' as const,
      name: 'Acme SA',
      taxCondition: 'Responsable Inscripto',
      fiscalAddress: 'Av. Siempreviva 742, CABA',
    };
    (stubAfipPadron.lookup as jest.Mock).mockResolvedValue(data);
    const service = new CompaniesService(stubAfipPadron);

    await expect(service.lookupAfip('20-12345678-6')).resolves.toEqual(data);
    expect(stubAfipPadron.lookup).toHaveBeenCalledWith('20123456786');
  });
});

describe('CompaniesService.listCompanies', () => {
  it('filters to active companies by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { company: { findMany } };
    const service = new CompaniesService(stubAfipPadron);

    await runInTenant(db, () => service.listCompanies());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { active: true } }),
    );
  });

  it('includes inactive companies when includeInactive is true', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { company: { findMany } };
    const service = new CompaniesService(stubAfipPadron);

    await runInTenant(db, () => service.listCompanies(undefined, true));

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('combines the active filter with a role filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const db = { company: { findMany } };
    const service = new CompaniesService(stubAfipPadron);

    await runInTenant(db, () => service.listCompanies('CUSTOMER'));

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { active: true, roles: { some: { role: 'CUSTOMER' } } },
      }),
    );
  });
});

describe('CompaniesService.deletePerson', () => {
  it('throws when the person does not exist', async () => {
    const db = { person: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new CompaniesService(stubAfipPadron);

    await expect(runInTenant(db, () => service.deletePerson('missing'))).rejects.toThrow(
      NotFoundException,
    );
  });

  it('deletes the person when it exists', async () => {
    const deletePerson = jest.fn().mockResolvedValue({ id: 'person-1' });
    const db = {
      person: {
        findUnique: jest.fn().mockResolvedValue({ id: 'person-1' }),
        delete: deletePerson,
      },
    };
    const service = new CompaniesService(stubAfipPadron);

    await runInTenant(db, () => service.deletePerson('person-1'));

    expect(deletePerson).toHaveBeenCalledWith({ where: { id: 'person-1' } });
  });
});
