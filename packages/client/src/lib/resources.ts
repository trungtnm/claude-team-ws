import { api } from './api'
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
  get: (sessionId: string) =>
    api.get<{ session: AgentSession }>(`/sessions/${sessionId}`),
  create: (projectId: string, data: { epicId: string; model?: string; promptOverride?: string | null }) =>
    api.post<{ session: AgentSession }>(`/projects/${projectId}/sessions`, data),
  cancel: (sessionId: string) =>
    api.post<void>(`/sessions/${sessionId}/cancel`),
  resume: (sessionId: string, data: { prompt: string }) =>
    api.post<{ session: AgentSession }>(`/sessions/${sessionId}/resume`, data),
  answer: (sessionId: string, data: { answer: string }) =>
    api.post<void>(`/sessions/${sessionId}/answer`, data),
  events: (sessionId: string, params?: { afterId?: number; limit?: number; eventType?: string }) => {
    const query = new URLSearchParams()
    if (params?.afterId) query.set('after_id', String(params.afterId))
    if (params?.limit) query.set('limit', String(params.limit))
    if (params?.eventType) query.set('event_type', params.eventType)
    const qs = query.toString()
    return api.get<{ events: SessionEvent[]; hasMore: boolean }>(
      `/sessions/${sessionId}/events${qs ? `?${qs}` : ''}`,
    )
  },
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

// Agent Mail (proxy)
export const mailApi = {
  threads: (projectId: string) =>
    api.get<{ threads: unknown[] }>(`/projects/${projectId}/mail/threads`),
  thread: (projectId: string, threadId: string) =>
    api.get<unknown>(`/projects/${projectId}/mail/threads/${threadId}`),
}
