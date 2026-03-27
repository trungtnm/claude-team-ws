import { api } from './api'
import { toCamelCase } from './case-convert'
import type {
  User,
  Project,
  Epic,
  Capture,
  AgentSession,
  SessionEvent,
  Notification,
  Repo,
  KnowledgeRule,
  WebhookConfig,
  GraphData,
  PrReviewApiResponse,
  ScopeAnalysis,
  Member,
  ActivityEntry,
  ProjectMetrics,
} from '@/types'

// Auth
export const authApi = {
  login: (apiKey: string) =>
    api.post<{ user: User }>('/auth/login', { apiKey }),
  me: () => api.get<{ user: User }>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
}

// Projects
export const projectsApi = {
  list: () =>
    api.get<{ projects: Project[] }>('/projects'),
  get: (projectId: string) =>
    api.get<{ project: Project }>(`/projects/${projectId}`),
  create: (data: { name: string; slug: string }) =>
    api.post<{ project: Project }>('/projects', data),
  update: (projectId: string, data: Partial<Pick<Project, 'name' | 'maxConcurrentAgents' | 'askQuestionMode'>>) =>
    api.patch<{ project: Project }>(`/projects/${projectId}`, data),
  uploadPicture: async (projectId: string, file: File): Promise<{ project: Project }> => {
    const formData = new FormData()
    formData.append('picture', file)
    const token = localStorage.getItem('auth_token')
    const res = await fetch(`/api/projects/${projectId}/picture`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Upload failed' }))
      throw new Error(err.error ?? 'Upload failed')
    }
    const json = await res.json()
    return toCamelCase(json)
  },
  removePicture: (projectId: string) =>
    api.delete<{ project: Project }>(`/projects/${projectId}/picture`),
}

// Repos
export const reposApi = {
  list: (projectId: string) =>
    api.get<{ repos: Repo[] }>(`/projects/${projectId}/repos`),
  clone: (projectId: string, data: { name: string; gitUrl: string; defaultBranch?: string }) =>
    api.post<{ repo: Repo }>(`/projects/${projectId}/repos`, { ...data, mode: 'clone' }),
  link: (projectId: string, data: { name: string; sourcePath: string; defaultBranch?: string }) =>
    api.post<{ repo: Repo }>(`/projects/${projectId}/repos`, { ...data, mode: 'link' }),
  remove: (projectId: string, repoName: string) =>
    api.delete(`/projects/${projectId}/repos/${repoName}`, { confirm: true }),
  pull: (projectId: string, repoName: string) =>
    api.post<{ result: string; newCommits: number; head: string }>(
      `/projects/${projectId}/repos/${repoName}/pull`,
    ),
  branches: (projectId: string, repoName: string) =>
    api.get<{ branches: Array<{ name: string; isDefault: boolean; ahead: number; behind: number }> }>(
      `/projects/${projectId}/repos/${repoName}/branches`,
    ),
}

// Captures
export const capturesApi = {
  list: (projectId: string, params?: { status?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return api.get<{ captures: Capture[] }>(`/projects/${projectId}/captures${qs ? `?${qs}` : ''}`)
  },
  create: (projectId: string, data: { text: string }) =>
    api.post<{ capture: Capture }>(`/projects/${projectId}/captures`, data),
  update: (projectId: string, captureId: string, data: {
    status: string
    triageResult?: { type: string; title: string; description: string; priority: number }
  }) =>
    api.patch<{ capture: Capture }>(`/projects/${projectId}/captures/${captureId}`, data),
  delete: (projectId: string, captureId: string) =>
    api.delete(`/projects/${projectId}/captures/${captureId}`),
}

// Epics
export const epicsApi = {
  list: (projectId: string, params?: { uiStatus?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.uiStatus) query.set('ui_status', params.uiStatus)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return api.get<{ epics: Epic[] }>(`/projects/${projectId}/epics${qs ? `?${qs}` : ''}`)
  },
  get: (projectId: string, epicId: string) =>
    api.get<{ epic: Epic }>(`/projects/${projectId}/epics/${epicId}`),
  create: (projectId: string, data: {
    title: string
    description: string
    priority: number
    labels: string[]
    repos: string[]
  }) =>
    api.post<{ epic: Epic }>(`/projects/${projectId}/epics`, data),
  update: (projectId: string, epicId: string, data: {
    uiStatus?: string
    gitBranches?: string[]
    beadPriority?: number
    beadType?: string
    beadLabels?: string[]
    beadAssignee?: string
  }) =>
    api.patch<{ epic: Epic }>(`/projects/${projectId}/epics/${epicId}`, data),
  analyzeScope: (projectId: string, epicId: string) =>
    api.post<{ analysis: ScopeAnalysis }>(`/projects/${projectId}/epics/${epicId}/analyze-scope`),
  confirmSplit: (projectId: string, epicId: string, beads: Array<{ title: string; priority: number; description: string }>) =>
    api.post<void>(`/projects/${projectId}/epics/${epicId}/confirm-split`, { beads }),
}

// Sessions
export const sessionsApi = {
  list: (projectId: string, params?: { status?: string; epicId?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.epicId) query.set('epic_id', params.epicId)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return api.get<{ sessions: AgentSession[] }>(`/projects/${projectId}/sessions${qs ? `?${qs}` : ''}`)
  },
  get: (projectId: string, sessionId: string) =>
    api.get<{ session: AgentSession }>(`/projects/${projectId}/sessions/${sessionId}`),
  create: (projectId: string, data: { epicId?: string; model?: string; name?: string; prompt: string }) =>
    api.post<{ session: AgentSession }>(`/projects/${projectId}/sessions`, data),
  cancel: (projectId: string, sessionId: string) =>
    api.post<void>(`/projects/${projectId}/sessions/${sessionId}/cancel`),
  resume: (projectId: string, sessionId: string, data: { prompt: string }) =>
    api.post<{ session: AgentSession }>(`/projects/${projectId}/sessions/${sessionId}/resume`, data),
  answer: (projectId: string, sessionId: string, data: { answer: string }) =>
    api.post<void>(`/projects/${projectId}/sessions/${sessionId}/answer`, data),
  events: (projectId: string, sessionId: string, params?: { afterId?: number; limit?: number; eventType?: string }) => {
    const query = new URLSearchParams()
    if (params?.afterId !== undefined) query.set('after_id', String(params.afterId))
    if (params?.limit !== undefined) query.set('limit', String(params.limit))
    if (params?.eventType) query.set('event_type', params.eventType)
    const qs = query.toString()
    return api.get<{ events: SessionEvent[]; hasMore: boolean }>(
      `/projects/${projectId}/sessions/${sessionId}/events${qs ? `?${qs}` : ''}`,
    )
  },
  complete: (projectId: string, sessionId: string) =>
    api.post<{ session: AgentSession }>(`/projects/${projectId}/sessions/${sessionId}/complete`),
  sendMessage: (projectId: string, sessionId: string, data: { message: string }) =>
    api.post<{ status: string }>(`/projects/${projectId}/sessions/${sessionId}/message`, data),
  setPermissionMode: (projectId: string, sessionId: string, data: { mode: string }) =>
    api.post<{ status: string; mode: string }>(`/projects/${projectId}/sessions/${sessionId}/permission-mode`, data),
}

// Reviews
export const reviewsApi = {
  list: (projectId: string) =>
    api.get<{ reviews: AgentSession[] }>(`/projects/${projectId}/reviews`),
  get: (projectId: string, sessionId: string) =>
    api.get<PrReviewApiResponse>(`/projects/${projectId}/reviews/${sessionId}`),
  comment: (projectId: string, sessionId: string, data: { body: string }) =>
    api.post<void>(`/projects/${projectId}/reviews/${sessionId}/comment`, data),
  merge: (projectId: string, sessionId: string, data: { strategy: 'squash' | 'merge' | 'rebase' }) =>
    api.post<void>(`/projects/${projectId}/reviews/${sessionId}/merge`, data),
}

// Graph
export const graphApi = {
  get: (projectId: string) =>
    api.get<GraphData>(`/projects/${projectId}/graph`),
  triage: (projectId: string) =>
    api.get<unknown>(`/projects/${projectId}/graph/triage`),
  plan: (projectId: string) =>
    api.get<unknown>(`/projects/${projectId}/graph/plan`),
}

// Rules
export const rulesApi = {
  list: (projectId: string, params?: { category?: string; maturity?: string; minConfidence?: number }) => {
    const query = new URLSearchParams()
    if (params?.category) query.set('category', params.category)
    if (params?.maturity) query.set('maturity', params.maturity)
    if (params?.minConfidence) query.set('min_confidence', String(params.minConfidence))
    const qs = query.toString()
    return api.get<{ rules: KnowledgeRule[] }>(`/projects/${projectId}/rules${qs ? `?${qs}` : ''}`)
  },
  create: (projectId: string, data: { ruleText: string; category: string; confidence: number }) =>
    api.post<{ rule: KnowledgeRule }>(`/projects/${projectId}/rules`, data),
  update: (projectId: string, ruleId: string, data: Partial<KnowledgeRule>) =>
    api.patch<{ rule: KnowledgeRule }>(`/projects/${projectId}/rules/${ruleId}`, data),
  delete: (projectId: string, ruleId: string) =>
    api.delete(`/projects/${projectId}/rules/${ruleId}`),
  improve: (projectId: string, text: string) =>
    api.post<{ suggestion: string; explanation: string; category: string }>(
      `/projects/${projectId}/rules/improve`,
      { text },
    ),
}

// Members
export const membersApi = {
  list: (projectId: string) =>
    api.get<{ members: Member[] }>(`/projects/${projectId}/members`),
  add: (projectId: string, data: { userId: string; roleOverride?: string }) =>
    api.post<{ member: Member }>(`/projects/${projectId}/members`, data),
  updateRole: (projectId: string, userId: string, data: { roleOverride: string | null }) =>
    api.patch<{ member: Member }>(`/projects/${projectId}/members/${userId}`, data),
  remove: (projectId: string, userId: string) =>
    api.delete(`/projects/${projectId}/members/${userId}`),
}

// Webhooks
export const webhooksApi = {
  list: (projectId: string) =>
    api.get<{ webhooks: WebhookConfig[] }>(`/projects/${projectId}/webhooks`),
  create: (projectId: string, data: { type: string; url: string; events: string[] }) =>
    api.post<{ webhook: WebhookConfig }>(`/projects/${projectId}/webhooks`, data),
  update: (projectId: string, webhookId: string, data: Partial<Pick<WebhookConfig, 'url' | 'events' | 'enabled'>>) =>
    api.patch<{ webhook: WebhookConfig }>(`/projects/${projectId}/webhooks/${webhookId}`, data),
  delete: (projectId: string, webhookId: string) =>
    api.delete(`/projects/${projectId}/webhooks/${webhookId}`),
  sendTest: (projectId: string, webhookId: string) =>
    api.post<{ success: boolean; statusCode: number; error?: string }>(
      `/projects/${projectId}/webhooks/${webhookId}/test`,
    ),
}

// Notifications
export const notificationsApi = {
  list: (params?: { read?: boolean; limit?: number }) => {
    const query = new URLSearchParams()
    if (params?.read !== undefined) query.set('read', String(params.read))
    if (params?.limit) query.set('limit', String(params.limit))
    const qs = query.toString()
    return api.get<{ notifications: Notification[] }>(`/notifications${qs ? `?${qs}` : ''}`)
  },
  markRead: (notificationId: string) =>
    api.patch<void>(`/notifications/${notificationId}`, { read: true }),
  markAllRead: () =>
    api.post<void>('/notifications/mark-all-read'),
}

// Health / Diagnostics
export const healthApi = {
  diagnostics: () =>
    api.get<{
      status: string
      cliTools: Record<string, boolean>
      dockerServices: Record<string, boolean>
      uptime: number
    }>('/health/diagnostics'),
}

// Activity
export const activityApi = {
  list: (projectId: string, params?: { action?: string; limit?: number; offset?: number }) => {
    const query = new URLSearchParams()
    if (params?.action) query.set('action', params.action)
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.offset) query.set('offset', String(params.offset))
    const qs = query.toString()
    return api.get<{ activity: ActivityEntry[]; total: number }>(
      `/projects/${projectId}/activity${qs ? `?${qs}` : ''}`,
    )
  },
  metrics: (projectId: string) =>
    api.get<ProjectMetrics>(`/projects/${projectId}/activity/metrics`),
}

// Agent Mail (proxy)
export const mailApi = {
  threads: (projectId: string) =>
    api.get<{ threads: unknown[] }>(`/projects/${projectId}/mail/threads`),
  thread: (projectId: string, threadId: string) =>
    api.get<unknown>(`/projects/${projectId}/mail/threads/${threadId}`),
}
