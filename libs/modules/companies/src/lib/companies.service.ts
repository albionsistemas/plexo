import { BadGatewayException, BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  type Company,
  type CompanyRoleType,
  type Person,
} from '@plexo/database';
import {
  AFIP_PADRON,
  AfipLookupError,
  AfipNotConfiguredError,
  type AfipPadronData,
  type AfipPadronPort,
} from './afip-padron.port.js';
import { isValidCuit } from './cuit.js';
import type { CreateCompanyDto } from './dto/create-company.dto.js';
import type { CreatePersonDto } from './dto/create-person.dto.js';
import type { UpdateCompanyDto } from './dto/update-company.dto.js';
import type { UpdatePersonDto } from './dto/update-person.dto.js';

export type CompanyWithRoles = Company & { roles: { role: CompanyRoleType }[] };

@Injectable()
export class CompaniesService {
  constructor(@Inject(AFIP_PADRON) private readonly afipPadron: AfipPadronPort) {}

  async createCompany(dto: CreateCompanyDto): Promise<CompanyWithRoles> {
    const tenantId = getTenantId();
    return getTenantDb().company.create({
      data: {
        tenantId,
        name: dto.name,
        taxId: dto.taxId,
        email: dto.email,
        creditLimit: dto.creditLimit ?? 0,
        pointOfSaleNumber: dto.pointOfSaleNumber,
        taxCondition: dto.taxCondition,
        fiscalAddress: dto.fiscalAddress,
        roles: { createMany: { data: dto.roles.map((role) => ({ tenantId, role })) } },
      },
      include: { roles: true },
    });
  }

  /** Inactive companies (soft-deleted, see Company.active) are excluded by
   * default - pass includeInactive to reach them (e.g. to reactivate one). */
  listCompanies(role?: CompanyRoleType, includeInactive = false): Promise<CompanyWithRoles[]> {
    return getTenantDb().company.findMany({
      where: {
        ...(includeInactive ? {} : { active: true }),
        ...(role ? { roles: { some: { role } } } : {}),
      },
      include: { roles: true },
      orderBy: { name: 'asc' },
    });
  }

  /** Two sequential queries, not one `include` with two to-many relations -
   * getTenantDb() is a single interactive-transaction client (one Postgres
   * connection via $transaction), and Prisma can dispatch multiple to-many
   * relations as concurrent follow-up queries against it, which the driver
   * doesn't support on one connection (hangs instead of erroring - see
   * InvoicingService.getInvoice() for where this actually bit). Didn't
   * reproduce here under real load (8 sequential + 5 concurrent requests,
   * no hang, no pg deprecation warning), but the same risk shape is
   * present, so it gets the same fix preventively. */
  async getCompany(id: string): Promise<CompanyWithRoles & { people: Person[] }> {
    const db = getTenantDb();
    const company = await db.company.findUnique({
      where: { id },
      include: { roles: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    const people = await db.person.findMany({ where: { companyId: id } });
    return { ...company, people };
  }

  /**
   * roles, when provided, fully replaces the existing set (delete +
   * recreate) - see UpdateCompanyDto for why that's the chosen semantic
   * over an additive merge.
   */
  async updateCompany(id: string, dto: UpdateCompanyDto): Promise<CompanyWithRoles> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const existing = await db.company.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Company not found');
    }

    if (dto.roles) {
      await db.companyRole.deleteMany({ where: { companyId: id } });
      await db.companyRole.createMany({
        data: dto.roles.map((role) => ({ tenantId, companyId: id, role })),
      });
    }

    return db.company.update({
      where: { id },
      data: {
        name: dto.name,
        taxId: dto.taxId,
        email: dto.email,
        creditLimit: dto.creditLimit,
        pointOfSaleNumber: dto.pointOfSaleNumber,
        taxCondition: dto.taxCondition,
        fiscalAddress: dto.fiscalAddress,
        active: dto.active,
      },
      include: { roles: true },
    });
  }

  /** Only a CUSTOMER or SUPPLIER company gets contact people - a BRANCH
   * is the tenant's own location, not an external party with a contact. */
  async createPerson(dto: CreatePersonDto): Promise<Person> {
    const db = getTenantDb();
    const tenantId = getTenantId();
    const company = await db.company.findUnique({
      where: { id: dto.companyId },
      include: { roles: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    const isContactable = company.roles.some(
      (r) => r.role === 'CUSTOMER' || r.role === 'SUPPLIER',
    );
    if (!isContactable) {
      throw new BadRequestException(
        'Only customer or supplier companies can have contact people',
      );
    }

    return db.person.create({
      data: {
        tenantId,
        companyId: dto.companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        nickname: dto.nickname,
        email: dto.email,
        whatsapp: dto.whatsapp,
        avatarUrl: dto.avatarUrl,
        jobTitle: dto.jobTitle,
      },
    });
  }

  listPeople(companyId: string): Promise<Person[]> {
    return getTenantDb().person.findMany({
      where: { companyId },
      orderBy: { firstName: 'asc' },
    });
  }

  async updatePerson(id: string, dto: UpdatePersonDto): Promise<Person> {
    const existing = await getTenantDb().person.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Person not found');
    }
    return getTenantDb().person.update({ where: { id }, data: { ...dto } });
  }

  /** Contacts have no fiscal/commercial significance and nothing else in
   * the schema references a Person, so this is a real delete - unlike
   * Company, there's no historical record that would dangle from it. */
  async deletePerson(id: string): Promise<void> {
    const db = getTenantDb();
    const existing = await db.person.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Person not found');
    }
    await db.person.delete({ where: { id } });
  }

  /** User-initiated (a "Buscar en AFIP" button), so failures surface as
   * real HTTP errors instead of being swallowed - see AfipPadronPort. */
  async lookupAfip(rawCuit: string): Promise<AfipPadronData> {
    if (!isValidCuit(rawCuit)) {
      throw new BadRequestException('CUIT inválido');
    }

    let result: AfipPadronData | null;
    try {
      result = await this.afipPadron.lookup(rawCuit.replace(/\D/g, ''));
    } catch (err) {
      if (err instanceof AfipNotConfiguredError) {
        throw new BadRequestException(
          'La consulta a AFIP no está configurada en este servidor',
        );
      }
      if (err instanceof AfipLookupError) {
        throw new BadGatewayException(err.message);
      }
      throw err;
    }

    if (!result) {
      throw new NotFoundException('AFIP no tiene datos para ese CUIT');
    }
    return result;
  }
}
