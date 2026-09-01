import { api } from '@/lib/api';

export type TiendanubeConnectorStatus = 'DISCONNECTED' | 'PENDING' | 'CONNECTED' | 'EXPIRED' | 'REVOKED' | 'ERROR';

export interface TiendanubeConnectorStatusResponse {
  status: TiendanubeConnectorStatus;
  storeName: string | null;
  storeId: string | null;
  connectedAt: string | null;
}

export interface TiendanubeCatalogStatus {
  publishedCount: number;
  syncedCount: number;
}

export interface TiendanubeCatalogSyncSkip {
  articleId: string;
  name: string;
  reason: string;
}

export interface TiendanubeCatalogSyncResult {
  total: number;
  synced: number;
  skipped: TiendanubeCatalogSyncSkip[];
}

export const tiendanubeApi = {
  getStatus: () => api.get<TiendanubeConnectorStatusResponse>('/connectors/tiendanube/status').then((r) => r.data),
  authorize: () => api.get<{ authorizationUrl: string }>('/connectors/tiendanube/authorize').then((r) => r.data),
  disconnect: () => api.post('/connectors/tiendanube/disconnect').then((r) => r.data),
  getCatalogStatus: () => api.get<TiendanubeCatalogStatus>('/connectors/tiendanube/catalog/status').then((r) => r.data),
  syncCatalog: () => api.post<TiendanubeCatalogSyncResult>('/connectors/tiendanube/catalog/sync').then((r) => r.data),
};
