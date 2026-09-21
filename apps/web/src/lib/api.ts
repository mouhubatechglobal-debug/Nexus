import { healthResponseSchema, type HealthResponse } from '@nexus/contracts';
import { err, ok, type Result } from '@nexus/core';

/**
 * Client HTTP du frontend — abstraction unique vers l'API.
 * Le navigateur ne parle JAMAIS directement à PostgreSQL : tout passe
 * par l'API (Interface → API → service → base). Cookies de session
 * HttpOnly automatiques (même origine via le proxy /api en dev).
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const payload = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = payload as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(
      response.status,
      envelope?.error?.code ?? 'UNKNOWN',
      envelope?.error?.message ?? `Erreur ${response.status}`,
    );
  }
  return payload as T;
}

const body = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });

/* ------------------------------- Types -------------------------------- */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  role: 'member' | 'admin' | 'owner';
  createdAt: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string | null;
  status: 'draft' | 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export type BrainKind =
  | 'context'
  | 'objective'
  | 'constraint'
  | 'decision'
  | 'architecture'
  | 'preference'
  | 'knowledge'
  | 'info';

export interface BrainEntry {
  id: string;
  projectId: string;
  kind: BrainKind;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileNode {
  id: string;
  projectId: string;
  path: string;
  name: string;
  isDirectory: boolean;
  mime: string;
  size: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface FileContent extends FileNode {
  content: string;
}

export type LabKind =
  | 'experiment'
  | 'hypothesis'
  | 'question'
  | 'result'
  | 'source'
  | 'note'
  | 'conclusion';

export interface LabEntry {
  id: string;
  projectId: string;
  kind: LabKind;
  title: string;
  content: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
  verified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuditCheck {
  id: string;
  category: 'Performance' | 'SEO' | 'Accessibility' | 'UX' | 'Security' | 'Configuration';
  status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_TESTED';
  message: string;
}

export interface AuditReport {
  id: string;
  projectId: string;
  summary: { pass: number; warn: number; fail: number; notTested: number };
  results: AuditCheck[];
  createdAt: string;
}

export interface DesignVersion {
  version: number;
  data: unknown;
  createdAt: string;
}

/* ------------------------------- Client ------------------------------- */

export const api = {
  // Auth
  me: () => request<{ user: AuthUser }>('/v1/auth/me').then((r) => r.user),
  login: (email: string, password: string) =>
    request<{ user: AuthUser }>('/v1/auth/login', { method: 'POST', ...body({ email, password }) }),
  register: (input: { email: string; password: string; displayName?: string; organizationName?: string }) =>
    request<{ user: AuthUser }>('/v1/auth/register', { method: 'POST', ...body(input) }),
  logout: () => request<void>('/v1/auth/logout', { method: 'POST' }),

  // Organisations
  organizations: () => request<{ data: Organization[] }>('/v1/organizations').then((r) => r.data),
  createOrganization: (name: string) =>
    request<Organization>('/v1/organizations', { method: 'POST', ...body({ name }) }),

  // Projets
  projects: (organizationId: string, query: { page?: number; limit?: number; q?: string } = {}) => {
    const search = new URLSearchParams({ organizationId });
    if (query.page) search.set('page', String(query.page));
    if (query.limit) search.set('limit', String(query.limit));
    if (query.q) search.set('q', query.q);
    return request<Paginated<Project>>(`/v1/projects?${search}`);
  },
  createProject: (input: { organizationId: string; name: string; description?: string }) =>
    request<Project>('/v1/projects', { method: 'POST', ...body(input) }),
  deleteProject: (projectId: string) =>
    request<void>(`/v1/projects/${projectId}`, { method: 'DELETE' }),

  // Brain
  brainList: (projectId: string, kind?: BrainKind) =>
    request<{ data: BrainEntry[] }>(`/v1/projects/${projectId}/brain${kind ? `?kind=${kind}` : ''}`).then((r) => r.data),
  brainCreate: (projectId: string, input: { kind: BrainKind; title: string; content: string }) =>
    request<BrainEntry>(`/v1/projects/${projectId}/brain`, { method: 'POST', ...body(input) }),
  brainDelete: (projectId: string, entryId: string) =>
    request<void>(`/v1/projects/${projectId}/brain/${entryId}`, { method: 'DELETE' }),

  // Forge — fichiers
  filesList: (projectId: string, prefix?: string) =>
    request<{ data: FileNode[] }>(`/v1/projects/${projectId}/files${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`).then((r) => r.data),
  fileRead: (projectId: string, path: string) =>
    request<FileContent>(`/v1/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`),
  fileCreate: (projectId: string, input: { path: string; type: 'file' | 'directory'; content?: string }) =>
    request<FileNode>(`/v1/projects/${projectId}/files`, { method: 'POST', ...body(input) }),
  fileWrite: (projectId: string, path: string, content: string) =>
    request<FileNode>(`/v1/projects/${projectId}/files`, { method: 'PUT', ...body({ path, content }) }),
  fileRename: (projectId: string, path: string, newPath: string) =>
    request<{ data: FileNode[] }>(`/v1/projects/${projectId}/files`, { method: 'PATCH', ...body({ path, newPath }) }),
  fileDelete: (projectId: string, path: string) =>
    request<{ removed: number }>(`/v1/projects/${projectId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),

  // Studio
  studioGet: (projectId: string) =>
    request<{ design: DesignVersion | null; versions?: { version: number; createdAt: string }[] }>(`/v1/projects/${projectId}/studio`),
  studioSave: (projectId: string, data: unknown) =>
    request<DesignVersion>(`/v1/projects/${projectId}/studio`, { method: 'POST', ...body({ data }) }),

  // Lab
  labList: (projectId: string, kind?: LabKind) =>
    request<{ data: LabEntry[] }>(`/v1/projects/${projectId}/lab${kind ? `?kind=${kind}` : ''}`).then((r) => r.data),
  labCreate: (projectId: string, input: { kind: LabKind; title: string; content: string; sourceUrl?: string; sourceLabel?: string; verified?: boolean }) =>
    request<LabEntry>(`/v1/projects/${projectId}/lab`, { method: 'POST', ...body(input) }),

  // Doctor
  auditsList: (projectId: string) =>
    request<{ data: AuditReport[] }>(`/v1/projects/${projectId}/audits`).then((r) => r.data),
  auditsRun: (projectId: string) =>
    request<AuditReport>(`/v1/projects/${projectId}/audits`, { method: 'POST' }),
};

/** Sonde de santé (inchangée — Result typé). */
export async function fetchHealth(signal?: AbortSignal): Promise<Result<HealthResponse, string>> {
  try {
    const response = await fetch('/api/health', { signal });
    if (!response.ok) {
      return err(`Réponse HTTP ${response.status}`);
    }
    const parsed = healthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return err('Payload /health invalide');
    }
    return ok(parsed.data);
  } catch {
    return err('API injoignable');
  }
}
