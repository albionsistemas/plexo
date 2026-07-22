import { api } from '@/lib/api';

export type TaxCalculationType = 'PERCENTAGE' | 'FIXED_AMOUNT' | 'FORMULA';

export interface TaxDefinition {
  id: string;
  code: string;
  name: string;
  calculationType: TaxCalculationType;
  rate: string | null;
  fixedAmount: string | null;
  formula: string | null;
  validFrom: string;
  validTo: string | null;
  managedByAccountant: boolean;
}

export interface CreateTaxDefinitionInput {
  code: string;
  name: string;
  calculationType?: TaxCalculationType;
  rate?: number;
  fixedAmount?: number;
  formula?: string;
  managedByAccountant?: boolean;
}

export interface ReviseTaxDefinitionInput {
  code: string;
  rate?: number;
  fixedAmount?: number;
  effectiveFrom?: string;
}

export const taxesApi = {
  listTaxDefinitions: () => api.get<TaxDefinition[]>('/taxes/definitions').then((r) => r.data),
  createTaxDefinition: (dto: CreateTaxDefinitionInput) =>
    api.post<TaxDefinition>('/taxes/definitions', dto).then((r) => r.data),
  reviseTaxDefinition: (dto: ReviseTaxDefinitionInput) =>
    api.post<TaxDefinition>('/taxes/definitions/revise', dto).then((r) => r.data),
  getTaxDefinitionHistory: (code: string) =>
    api.get<TaxDefinition[]>(`/taxes/definitions/${code}/history`).then((r) => r.data),
};
