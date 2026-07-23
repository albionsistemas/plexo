import { api } from '@/lib/api';

export type EmailSenderMode = 'SHARED' | 'CUSTOM_DOMAIN';
export type ReminderTone = 'FRIENDLY' | 'NEUTRAL' | 'FIRM';

export interface TenantSettings {
  arReminderIntervalDays: number | null;
  emailSenderMode: EmailSenderMode;
  emailFromName: string | null;
  emailFromLocalPart: string | null;
  emailCustomDomain: string | null;
  domainStatus: string | null;
  reminderTone: ReminderTone;
  reminderCcEmail: string | null;
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

export interface DomainRecord {
  record: string;
  name: string;
  value: string;
  type: string;
  ttl: string;
  status: string;
}

export interface DomainRegistrationResult {
  status: string;
  records: DomainRecord[];
}

export const tenantSettingsApi = {
  get: () => api.get<TenantSettings>('/tenant-settings').then((r) => r.data),
  update: (
    dto: Partial<{
      arReminderIntervalDays: number | null;
      emailSenderMode: EmailSenderMode;
      emailFromName: string;
      emailFromLocalPart: string;
      reminderTone: ReminderTone;
      reminderCcEmail: string | null;
    }>,
  ) => api.patch<TenantSettings>('/tenant-settings', dto).then((r) => r.data),
};

export const emailDomainApi = {
  register: (domain: string) =>
    api.post<DomainRegistrationResult>('/tenant-settings/email-domain', { domain }).then((r) => r.data),
  verify: () =>
    api.post<DomainRegistrationResult>('/tenant-settings/email-domain/verify').then((r) => r.data),
};

export const remindersApi = {
  getStatus: () => api.get<ReminderStatus>('/receivables/reminders/status').then((r) => r.data),
  runNow: () => api.post<ReminderSweepResult>('/receivables/reminders/run-now').then((r) => r.data),
  reset: () => api.post<{ reset: number }>('/receivables/reminders/reset').then((r) => r.data),
};
