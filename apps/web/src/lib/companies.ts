import { api } from '@/lib/api';

export type CompanyRoleType = 'CUSTOMER' | 'SUPPLIER' | 'BRANCH';

export interface Company {
  id: string;
  name: string;
  taxId: string | null;
  email: string | null;
  creditLimit: string;
  pointOfSaleNumber: string | null;
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

export const companiesApi = {
  list: (role?: CompanyRoleType) =>
    api
      .get<Company[]>('/companies', { params: role ? { role } : undefined })
      .then((r) => r.data),
  create: (dto: CreateCompanyInput) => api.post<Company>('/companies', dto).then((r) => r.data),
  listPeople: (companyId: string) =>
    api.get<Person[]>(`/companies/${companyId}/people`).then((r) => r.data),
};
