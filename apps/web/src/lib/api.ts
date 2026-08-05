import axios from 'axios';

export const api = axios.create({ baseURL: 'http://localhost:3000/api' });

api.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 means the current token no longer works - either a normal session
// expired, or (the new case, see lib/impersonation.ts) a 15-minute
// impersonation token did. window.location.assign() rather than a Next
// router: this file isn't a component, has no router/QueryClient to reach,
// and a full navigation clears every in-memory cache (React Query
// included) on its own, no queryClient.clear() needed here.
//
// /auth/login itself is excluded: a wrong-password attempt also 401s, and
// LoginPage already shows its own "Credenciales inválidas" message - this
// interceptor firing there would yank the user away before they can read it.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginRequest = typeof error?.config?.url === 'string' && error.config.url.includes('/auth/login');
    if (typeof window !== 'undefined' && error?.response?.status === 401 && !isLoginRequest) {
      const adminToken = localStorage.getItem('adminToken');
      if (adminToken) {
        localStorage.setItem('token', adminToken);
        localStorage.removeItem('adminToken');
        localStorage.removeItem('impersonationExpiresAt');
        window.location.assign('/admin');
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('tenantId');
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);
