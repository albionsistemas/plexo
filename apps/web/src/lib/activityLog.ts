import { api } from '@/lib/api';

export interface MyActivityEntry {
  id: string;
  action: string;
  occurredAt: string;
}

export interface TenantActivityEntry {
  id: string;
  occurredAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  entityType: string | null;
  entityTypeLabel: string | null;
  entityId: string | null;
  entityLabel: string | null;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  ip: string | null;
  outcome: 'SUCCESS' | 'FAILURE';
  errorMessage: string | null;
}

export interface TenantActivityPage {
  items: TenantActivityEntry[];
  page: number;
  pageSize: number;
}

export const activityLogApi = {
  getMine: () => api.get<MyActivityEntry[]>('/auth/me/activity').then((r) => r.data),
  getTenant: (params: { page?: number; pageSize?: number; userId?: string; entityType?: string }) =>
    api.get<TenantActivityPage>('/activity-log', { params }).then((r) => r.data),
};
