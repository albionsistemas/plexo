import { api } from '@/lib/api';

export type CompanyRoleType = 'CUSTOMER' | 'SUPPLIER' | 'BRANCH';

export interface Company {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  creditLimit: string;
  pointOfSaleNumber: string | null;
  active: boolean;
  createdAt: string;
  roles: { role: CompanyRoleType }[];
}

export interface Person {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string | null;
  nickname: string | null;
  email: string | null;
  whatsapp: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
}

export interface CreateCompanyInput {
  name: string;
  taxId?: string;
  email?: string;
  creditLimit?: number;
  pointOfSaleNumber?: string;
  roles: CompanyRoleType[];
}

export interface UpdateCompanyInput {
  name?: string;
  taxId?: string;
  email?: string;
  creditLimit?: number;
  pointOfSaleNumber?: string;
  roles?: CompanyRoleType[];
  active?: boolean;
}

export interface CreatePersonInput {
  companyId: string;
  firstName: string;
  lastName?: string;
  nickname?: string;
  email?: string;
  whatsapp?: string;
  avatarUrl?: string;
  jobTitle?: string;
}

export interface AfipPadronData {
  cuit: string;
  personType: 'FISICA' | 'JURIDICA';
  name: string;
  taxCondition: string | null;
  fiscalAddress: string | null;
}

export const companiesApi = {
  list: (role?: CompanyRoleType, includeInactive?: boolean) =>
    api
      .get<Company[]>('/companies', {
        params: {
          ...(role ? { role } : {}),
          ...(includeInactive ? { includeInactive: 'true' } : {}),
        },
      })
      .then((r) => r.data),
  get: (id: string) => api.get<Company & { people: Person[] }>(`/companies/${id}`).then((r) => r.data),
  create: (dto: CreateCompanyInput) => api.post<Company>('/companies', dto).then((r) => r.data),
  update: (id: string, dto: UpdateCompanyInput) =>
    api.patch<Company>(`/companies/${id}`, dto).then((r) => r.data),
  listPeople: (companyId: string) =>
    api.get<Person[]>(`/companies/${companyId}/people`).then((r) => r.data),
  createPerson: (dto: CreatePersonInput) => api.post<Person>('/companies/people', dto).then((r) => r.data),
  lookupAfip: (cuit: string) =>
    api.get<AfipPadronData>(`/companies/afip/${encodeURIComponent(cuit)}`).then((r) => r.data),
  removePerson: (id: string) => api.delete(`/companies/people/${id}`).then(() => undefined),
};
