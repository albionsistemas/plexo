import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  getTenantDb,
  getTenantId,
  type Company,
  type CompanyRoleType,
  type Person,
} from '@plexo/database';
import type { CreateCompanyDto } from './dto/create-company.dto.js';
import type { CreatePersonDto } from './dto/create-person.dto.js';
import type { UpdateCompanyDto } from './dto/update-company.dto.js';
import type { UpdatePersonDto } from './dto/update-person.dto.js';

export type CompanyWithRoles = Company & { roles: { role: CompanyRoleType }[] };

@Injectable()
export class CompaniesService {
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
        roles: { createMany: { data: dto.roles.map((role) => ({ tenantId, role })) } },
      },
      include: { roles: true },
    });
  }

  listCompanies(role?: CompanyRoleType): Promise<CompanyWithRoles[]> {
    return getTenantDb().company.findMany({
      where: role ? { roles: { some: { role } } } : undefined,
      include: { roles: true },
      orderBy: { name: 'asc' },
    });
  }

  async getCompany(id: string): Promise<CompanyWithRoles & { people: Person[] }> {
    const company = await getTenantDb().company.findUnique({
      where: { id },
      include: { roles: true, people: true },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }
    return company;
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
}
