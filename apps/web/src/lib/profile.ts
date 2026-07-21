import { api } from '@/lib/api';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: string;
  tenantId: string;
  showOnlinePresence: boolean;
  createdAt: string;
}

export interface UpdateProfileInput {
  name?: string;
  avatarUrl?: string;
  showOnlinePresence?: boolean;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export const profileApi = {
  getMe: () => api.get<UserProfile>('/auth/me').then((r) => r.data),
  updateMe: (dto: UpdateProfileInput) => api.patch<UserProfile>('/auth/me', dto).then((r) => r.data),
  changePassword: (dto: ChangePasswordInput) => api.post('/auth/change-password', dto).then((r) => r.data),
};
