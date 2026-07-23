import { api } from '@/lib/api';

export interface TenantSettings {
  arReminderIntervalDays: number | null;
}

export interface ReminderStatus {
  recurringEnabled: boolean;
  arReminderIntervalDays: number | null;
  nextCronRunAt: string;
}

export interface ReminderSweepResult {
  becomingOverdue: number;
  recurring: number;
}

export const tenantSettingsApi = {
  get: () => api.get<TenantSettings>('/tenant-settings').then((r) => r.data),
  update: (dto: { arReminderIntervalDays: number | null }) =>
    api.patch<TenantSettings>('/tenant-settings', dto).then((r) => r.data),
};

export const remindersApi = {
  getStatus: () => api.get<ReminderStatus>('/receivables/reminders/status').then((r) => r.data),
  runNow: () => api.post<ReminderSweepResult>('/receivables/reminders/run-now').then((r) => r.data),
  reset: () => api.post<{ reset: number }>('/receivables/reminders/reset').then((r) => r.data),
};
