// ---------------------------------------------------------------------------
// API Client — base fetch wrapper with auth header injection
// ---------------------------------------------------------------------------

const BASE_URL = '/api'

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders as Record<string, string>,
  }

  // Inject auth token if available
  const token = localStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }))
    throw new Error(error.message ?? `HTTP ${response.status}`)
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export interface Project {
  id: string
  name: string
  repoUrl: string
  createdAt: string
}

export interface Epic {
  id: string
  projectId: string
  title: string
  status: 'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done'
  priority: 'p0' | 'p1' | 'p2' | 'p3'
  createdAt: string
}

export interface Capture {
  id: string
  projectId: string
  content: string
  source: string
  status: 'inbox' | 'triaged' | 'discarded'
  createdAt: string
}

export interface AgentSession {
  id: string
  epicId: string
  beadId: string | null
  status: 'queued' | 'running' | 'completed' | 'failed'
  startedAt: string | null
  completedAt: string | null
}

export interface Notification {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

// ---------------------------------------------------------------------------
// Resource methods
// ---------------------------------------------------------------------------

// Projects
export const projectsApi = {
  list: () => request<Project[]>('/projects'),
  get: (id: string) => request<Project>(`/projects/${id}`),
  create: (data: Omit<Project, 'id' | 'createdAt'>) =>
    request<Project>('/projects', { method: 'POST', body: data }),
  update: (id: string, data: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: data }),
  delete: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
}

// Epics
export const epicsApi = {
  list: (projectId: string) => request<Epic[]>(`/projects/${projectId}/epics`),
  get: (projectId: string, id: string) =>
    request<Epic>(`/projects/${projectId}/epics/${id}`),
  create: (projectId: string, data: Omit<Epic, 'id' | 'projectId' | 'createdAt'>) =>
    request<Epic>(`/projects/${projectId}/epics`, { method: 'POST', body: data }),
  update: (projectId: string, id: string, data: Partial<Epic>) =>
    request<Epic>(`/projects/${projectId}/epics/${id}`, { method: 'PATCH', body: data }),
  delete: (projectId: string, id: string) =>
    request<void>(`/projects/${projectId}/epics/${id}`, { method: 'DELETE' }),
}

// Captures
export const capturesApi = {
  list: (projectId: string) => request<Capture[]>(`/projects/${projectId}/captures`),
  create: (projectId: string, data: Omit<Capture, 'id' | 'projectId' | 'createdAt'>) =>
    request<Capture>(`/projects/${projectId}/captures`, { method: 'POST', body: data }),
  update: (projectId: string, id: string, data: Partial<Capture>) =>
    request<Capture>(`/projects/${projectId}/captures/${id}`, { method: 'PATCH', body: data }),
  delete: (projectId: string, id: string) =>
    request<void>(`/projects/${projectId}/captures/${id}`, { method: 'DELETE' }),
}

// Agent Sessions
export const sessionsApi = {
  list: (projectId: string) => request<AgentSession[]>(`/projects/${projectId}/sessions`),
  get: (projectId: string, id: string) =>
    request<AgentSession>(`/projects/${projectId}/sessions/${id}`),
  create: (projectId: string, data: Omit<AgentSession, 'id' | 'startedAt' | 'completedAt'>) =>
    request<AgentSession>(`/projects/${projectId}/sessions`, { method: 'POST', body: data }),
  cancel: (projectId: string, id: string) =>
    request<AgentSession>(`/projects/${projectId}/sessions/${id}/cancel`, { method: 'POST' }),
}

// Notifications
export const notificationsApi = {
  list: () => request<Notification[]>('/notifications'),
  markRead: (id: string) =>
    request<Notification>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllRead: () =>
    request<void>('/notifications/read-all', { method: 'POST' }),
}
