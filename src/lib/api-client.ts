import type { QrStyle } from '@/src/lib/qr-styled';

export interface AdminUser {
  username: string;
}

export interface AuthConfig {
  authConfigured: boolean;
  dbConfigured: boolean;
  storageConfigured: boolean;
}

export interface TemplateItem {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  usageCount: number;
  inUse: boolean;
  createdAt: string;
}

export interface OwnerDocumentItem {
  id: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  isPublic: boolean;
  createdAt: string;
}

export interface LabelConfig {
  id: string;
  ownerId: string;
  templateId: string;
  templateName: string;
  templateWidth: number;
  templateHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  qrStyle: QrStyle;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerDashboardStats {
  totalOwners: number;
  activeOwners: number;
  inactiveOwners: number;
  totalScans?: number;
  totalLabels: number;
  totalTemplates: number;
  totalDocuments: number;
}

export type OwnerStatusFilter = 'all' | 'active' | 'inactive';

export interface OwnerSummary {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: boolean;
  documentCount: number;
  hasLabel: boolean;
  templateId: string | null;
  templateName: string | null;
  tokenVersion: number;
  scanCount: number;
  lastScannedAt: string | null;
  publicToken: string | null;
  publicUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerDetailResponse {
  owner: {
    id: string;
    firstName: string;
    lastName: string;
    fullName: string;
    email: string | null;
    phone: string | null;
    status: boolean;
    tokenVersion: number;
    scanCount: number;
    lastScannedAt: string | null;
    publicToken: string | null;
    publicUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  documents: OwnerDocumentItem[];
  label: LabelConfig | null;
}

export interface PublicCardDocument {
  id: string;
  originalName: string;
  mimeType: string;
  createdAt?: string;
}

export interface PublicCardData {
  fullName: string;
  email: string | null;
  phone: string | null;
  documents: PublicCardDocument[];
}

let inMemorySessionToken: string | null = null;

export function getAuthHeaders(): Record<string, string> {
  return inMemorySessionToken
    ? { Authorization: `Bearer ${inMemorySessionToken}` }
    : {};
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  requiresAuth = true,
): Promise<T> {
  const authHeaders = requiresAuth ? getAuthHeaders() : {};
  const res = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders,
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && url !== '/api/v1/auth/login') {
    inMemorySessionToken = null;
  }

  if (!res.ok) {
    let message = 'Error al comunicarse con el servidor.';
    try {
      const data = await res.json();
      if (data?.error) message = data.error;
    } catch {
      // Ignore JSON parse failure
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

export const apiClient = {
  getAuthConfig: () => requestJson<AuthConfig>('/api/v1/auth/config', {}, false),
  getMe: () => requestJson<{ admin: AdminUser }>('/api/v1/auth/me'),
  login: async (username: string, password: string) => {
    const res = await requestJson<{ admin: AdminUser; sessionToken?: string }>(
      '/api/v1/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      },
      false,
    );
    if (res.sessionToken) {
      inMemorySessionToken = res.sessionToken;
    }
    return { admin: res.admin };
  },
  logout: async () => {
    try {
      return await requestJson<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      inMemorySessionToken = null;
    }
  },

  listOwners: (q = '', status: OwnerStatusFilter = 'all') => {
    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (status !== 'all') params.set('status', status);
    const qs = params.toString();
    return requestJson<{ owners: OwnerSummary[]; stats?: OwnerDashboardStats }>(
      `/api/v1/owners${qs ? `?${qs}` : ''}`,
    );
  },
  getOwner: (id: string) => requestJson<OwnerDetailResponse>(`/api/v1/owners/${id}`),
  createOwnerWithLabel: (formData: FormData) =>
    requestJson<{ owner: OwnerDetailResponse['owner'] }>('/api/v1/owners', {
      method: 'POST',
      body: formData,
    }),
  updateOwner: (
    id: string,
    payload: { firstName: string; lastName: string; email: string; phone: string },
  ) =>
    requestJson<{ owner: OwnerDetailResponse['owner'] }>(`/api/v1/owners/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  setOwnerStatus: (id: string, status: boolean) =>
    requestJson<{
      status: boolean;
      tokenVersion: number;
      publicToken: string | null;
      publicUrl: string | null;
    }>(`/api/v1/owners/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  uploadDocuments: (ownerId: string, formData: FormData) =>
    requestJson<{ documents: OwnerDocumentItem[] }>(`/api/v1/owners/${ownerId}/documents`, {
      method: 'POST',
      body: formData,
    }),
  setDocumentVisibility: (docId: string, isPublic: boolean) =>
    requestJson<{ id: string; isPublic: boolean }>(`/api/v1/documents/${docId}/visibility`, {
      method: 'PATCH',
      body: JSON.stringify({ isPublic }),
    }),
  deleteDocument: (docId: string) =>
    requestJson<{ ok: boolean }>(`/api/v1/documents/${docId}`, { method: 'DELETE' }),

  listTemplates: () => requestJson<{ templates: TemplateItem[] }>('/api/v1/templates'),
  uploadTemplate: (formData: FormData) =>
    requestJson<{ template: TemplateItem }>('/api/v1/templates', {
      method: 'POST',
      body: formData,
    }),
  deleteTemplate: (id: string) =>
    requestJson<{ ok: boolean }>(`/api/v1/templates/${id}`, { method: 'DELETE' }),

  getOwnerLabel: (ownerId: string) =>
    requestJson<{
      owner: {
        id: string;
        fullName: string;
        status: boolean;
        tokenVersion: number;
        publicUrl: string | null;
      };
      label: LabelConfig | null;
    }>(`/api/v1/owners/${ownerId}/label`),
  saveOwnerLabel: (
    ownerId: string,
    payload: {
      templateId: string;
      x: number;
      y: number;
      width: number;
      height: number;
      qrStyle: QrStyle;
    },
  ) =>
    requestJson<{ label: LabelConfig }>(`/api/v1/owners/${ownerId}/label`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  fetchQrSvg: async (ownerId: string, style?: QrStyle): Promise<string> => {
    const query = style ? `?style=${encodeURIComponent(style)}` : '';
    const res = await fetch(`/api/v1/owners/${ownerId}/label/qr${query}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      let message = 'No se pudo cargar el código QR.';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // Ignore
      }
      throw new ApiError(message, res.status);
    }
    return res.text();
  },
  renderLabelPng: async (ownerId: string): Promise<Blob> => {
    const res = await fetch(`/api/v1/owners/${ownerId}/label/render`, {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      let message = 'No se pudo generar la imagen de la etiqueta.';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // Ignore
      }
      throw new ApiError(message, res.status);
    }
    return res.blob();
  },

  generatePrintSheet: async (payload: {
    ownerIds: string[];
    paperSize: 'letter' | 'tabloid';
    columns: number;
    cutGuides: boolean;
    gapSize: 'compact' | 'normal';
  }): Promise<Blob> => {
    const res = await fetch('/api/v1/labels/print-sheet', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let message = 'No se pudo generar la hoja de impresión.';
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
      } catch {
        // Ignore
      }
      throw new ApiError(message, res.status);
    }
    return res.blob();
  },

  getPublicCard: (token: string) =>
    requestJson<{ card: PublicCardData }>(`/api/v1/public/${encodeURIComponent(token)}`, {}, false),
};
