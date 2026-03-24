# 01 — Shared Infrastructure Spec

Foundation layer that ALL page implementations depend on. Implements the bridge from static demo data to live server integration using TanStack Query, Socket.IO, and auth context.

**Target directory:** `packages/client/src/`

---

## 1. API Client

**File:** `src/lib/api.ts` (extend existing)

The existing API client in `packages/client/src/lib/api.ts` provides the base pattern. Enhance it with snake_case-to-camelCase conversion, structured error handling, and proper type safety.

### 1.1 Base URL Handling

```typescript
// In dev: Vite proxy forwards /api/* to localhost:3000
// In prod: same-origin, no prefix needed
const BASE_URL = '/api'
```

Vite config must include:

```typescript
// vite.config.ts
server: {
  proxy: {
    '/api': 'http://localhost:3000',
    '/socket.io': {
      target: 'http://localhost:3000',
      ws: true,
    },
  },
}
```

### 1.2 Case Conversion

The server uses `snake_case` (DB schema convention). The frontend uses `camelCase` (TypeScript convention). All API responses must be converted automatically.

```typescript
// src/lib/case-convert.ts

type CamelCase<S extends string> = S extends `${infer P}_${infer Q}`
  ? `${P}${Capitalize<CamelCase<Q>>}`
  : S

export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function convertKeys<T>(obj: unknown, converter: (key: string) => string): T {
  if (Array.isArray(obj)) {
    return obj.map((item) => convertKeys(item, converter)) as T
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        converter(key),
        convertKeys(value, converter),
      ]),
    ) as T
  }
  return obj as T
}

export function toCamelCase<T>(obj: unknown): T {
  return convertKeys<T>(obj, snakeToCamel)
}

export function toSnakeCase<T>(obj: unknown): T {
  return convertKeys<T>(obj, camelToSnake)
}
```

### 1.3 Error Types

```typescript
// src/lib/api-error.ts

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorMessage: string,
    public readonly issues?: Array<{ path: string[]; message: string }>,
  ) {
    super(errorMessage)
    this.name = 'ApiError'
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  get isValidationError(): boolean {
    return this.status === 400
  }

  get isNotFound(): boolean {
    return this.status === 404
  }
}
```

### 1.4 Enhanced Request Helper

```typescript
// src/lib/api.ts

import { toCamelCase, toSnakeCase } from './case-convert'
import { ApiError } from './api-error'

const BASE_URL = '/api'

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  }

  // Auth token injection from localStorage (API key)
  // JWT auth uses HttpOnly cookie — browser sends automatically
  const token = localStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...rest,
    headers,
    credentials: 'include', // Send cookies (ctw_session JWT)
    body: body ? JSON.stringify(toSnakeCase(body)) : undefined,
  })

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: response.statusText,
    }))

    throw new ApiError(
      response.status,
      errorBody.error ?? `HTTP ${response.status}`,
      errorBody.issues, // zod validation issues from server
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  const json = await response.json()
  return toCamelCase<T>(json)
}

// Convenience methods
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string, body?: unknown) =>
    request<T>(path, { method: 'DELETE', body }),
}
```

### 1.5 Resource API Objects

These replace the existing simple API objects with types matching the real server responses.

```typescript
// src/lib/resources.ts

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
  PrReview,
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
  update: (projectId: string, data: Partial<Pick<Project, 'maxConcurrentAgents' | 'askQuestionMode'>>) =>
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
  update: (projectId: string, epicId: string, data: Partial<Epic>) =>
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
    api.get<{ reviews: PrReview[] }>(`/projects/${projectId}/reviews`),
  get: (sessionId: string) =>
    api.get<PrReview>(`/reviews/${sessionId}`),
  comment: (sessionId: string, data: { file: string; line: number; body: string }) =>
    api.post<void>(`/reviews/${sessionId}/comment`, data),
  merge: (sessionId: string, data: { strategy: 'squash' | 'merge' | 'rebase' }) =>
    api.post<void>(`/reviews/${sessionId}/merge`, data),
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

// Webhooks
export const webhooksApi = {
  list: (projectId: string) =>
    api.get<{ webhooks: WebhookConfig[] }>(`/projects/${projectId}/webhooks`),
  create: (projectId: string, data: { type: string; url: string; events: string[] }) =>
    api.post<{ webhook: WebhookConfig }>(`/projects/${projectId}/webhooks`, data),
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
```

---

## 2. TanStack Query Setup

### 2.1 QueryClient Configuration

**File:** `src/main.tsx` (update existing)

```typescript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s — data is fresh for 30s, then refetched on next access
      retry: 1,                // Retry once on failure
      refetchOnWindowFocus: true,
      gcTime: 5 * 60 * 1000,  // Garbage collect after 5 min unused
    },
    mutations: {
      retry: 0,                // Don't retry mutations
    },
  },
})

// In the render tree:
<QueryClientProvider client={queryClient}>
  <App />
  {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
</QueryClientProvider>
```

### 2.2 Query Key Factory

**File:** `src/lib/query-keys.ts`

All query keys follow a hierarchical factory pattern. This ensures consistent key structure and makes invalidation precise.

```typescript
export const queryKeys = {
  // Auth
  auth: {
    me: ['auth', 'me'] as const,
  },

  // Projects
  projects: {
    all: ['projects'] as const,
    list: () => [...queryKeys.projects.all, 'list'] as const,
    detail: (projectId: string) => [...queryKeys.projects.all, projectId] as const,
  },

  // Repos (scoped to project)
  repos: {
    all: (projectId: string) => ['repos', { projectId }] as const,
    list: (projectId: string) => [...queryKeys.repos.all(projectId), 'list'] as const,
    branches: (projectId: string, repoName: string) =>
      [...queryKeys.repos.all(projectId), repoName, 'branches'] as const,
  },

  // Captures (scoped to project)
  captures: {
    all: (projectId: string) => ['captures', { projectId }] as const,
    list: (projectId: string, status?: string) =>
      [...queryKeys.captures.all(projectId), 'list', { status }] as const,
  },

  // Epics (scoped to project)
  epics: {
    all: (projectId: string) => ['epics', { projectId }] as const,
    list: (projectId: string, uiStatus?: string) =>
      [...queryKeys.epics.all(projectId), 'list', { uiStatus }] as const,
    detail: (projectId: string, epicId: string) =>
      [...queryKeys.epics.all(projectId), epicId] as const,
  },

  // Sessions (scoped to project, detail by sessionId)
  sessions: {
    all: (projectId: string) => ['sessions', { projectId }] as const,
    list: (projectId: string, filters?: { status?: string; epicId?: string }) =>
      [...queryKeys.sessions.all(projectId), 'list', filters] as const,
    detail: (sessionId: string) => ['sessions', 'detail', sessionId] as const,
    events: (sessionId: string, params?: { afterId?: number; eventType?: string }) =>
      ['sessions', 'events', sessionId, params] as const,
  },

  // Reviews (scoped to project)
  reviews: {
    all: (projectId: string) => ['reviews', { projectId }] as const,
    list: (projectId: string) => [...queryKeys.reviews.all(projectId), 'list'] as const,
    detail: (sessionId: string) => ['reviews', 'detail', sessionId] as const,
  },

  // Graph (scoped to project)
  graph: {
    data: (projectId: string) => ['graph', { projectId }] as const,
    triage: (projectId: string) => ['graph', { projectId }, 'triage'] as const,
    plan: (projectId: string) => ['graph', { projectId }, 'plan'] as const,
  },

  // Rules (scoped to project)
  rules: {
    all: (projectId: string) => ['rules', { projectId }] as const,
    list: (projectId: string, filters?: { category?: string; maturity?: string }) =>
      [...queryKeys.rules.all(projectId), 'list', filters] as const,
  },

  // Webhooks (scoped to project)
  webhooks: {
    all: (projectId: string) => ['webhooks', { projectId }] as const,
    list: (projectId: string) => [...queryKeys.webhooks.all(projectId), 'list'] as const,
  },

  // Notifications (user-scoped, no projectId)
  notifications: {
    all: ['notifications'] as const,
    list: (params?: { read?: boolean }) => ['notifications', 'list', params] as const,
  },
} as const
```

### 2.3 Custom Query Hooks

**File:** `src/hooks/use-epics.ts` (one file per resource domain)

Pattern for all query hooks:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { epicsApi } from '@/lib/resources'
import { useProject } from '@/hooks/use-project'
import type { Epic } from '@/types'

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useEpics(uiStatus?: string) {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.epics.list(projectId, uiStatus),
    queryFn: async () => {
      const { epics } = await epicsApi.list(projectId, { uiStatus })
      return epics
    },
  })
}

export function useEpic(epicId: string) {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.epics.detail(projectId, epicId),
    queryFn: async () => {
      const { epic } = await epicsApi.get(projectId, epicId)
      return epic
    },
    enabled: Boolean(epicId),
  })
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateEpic() {
  const { projectId } = useProject()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      title: string
      description: string
      priority: number
      labels: string[]
      repos: string[]
    }) => epicsApi.create(projectId, data),
    onSuccess: () => {
      // Invalidate all epic lists — new epic could appear in any status
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.all(projectId),
      })
    },
  })
}

export function useUpdateEpic() {
  const { projectId } = useProject()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ epicId, data }: { epicId: string; data: Partial<Epic> }) =>
      epicsApi.update(projectId, epicId, data),
    onSuccess: (_result, { epicId }) => {
      // Invalidate both the list and the specific detail
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.all(projectId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(projectId, epicId),
      })
    },
  })
}
```

### 2.4 Hooks Index

**File:** `src/hooks/index.ts`

Each resource domain gets its own hook file:

| File | Hooks |
|------|-------|
| `use-auth.ts` | `useAuth()`, `useLogin()`, `useLogout()` |
| `use-projects.ts` | `useProjects()`, `useCreateProject()` |
| `use-epics.ts` | `useEpics(uiStatus?)`, `useEpic(epicId)`, `useCreateEpic()`, `useUpdateEpic()`, `useAnalyzeScope()`, `useConfirmSplit()` |
| `use-captures.ts` | `useCaptures(status?)`, `useCreateCapture()`, `useUpdateCapture()`, `useDeleteCapture()` |
| `use-sessions.ts` | `useSessions(filters?)`, `useSession(sessionId)`, `useSessionEvents(sessionId, params?)`, `useCreateSession()`, `useCancelSession()`, `useResumeSession()`, `useAnswerQuestion()` |
| `use-repos.ts` | `useRepos()`, `useCloneRepo()`, `useLinkRepo()`, `useRemoveRepo()`, `usePullRepo()`, `useRepoBranches(repoName)` |
| `use-reviews.ts` | `useReviews()`, `useReview(sessionId)`, `useAddComment()`, `useMergePr()` |
| `use-graph.ts` | `useGraph()`, `useGraphTriage()`, `useGraphPlan()` |
| `use-rules.ts` | `useRules(filters?)`, `useCreateRule()`, `useUpdateRule()`, `useDeleteRule()` |
| `use-webhooks.ts` | `useWebhooks()`, `useCreateWebhook()` |
| `use-notifications.ts` | `useNotifications(params?)`, `useMarkRead()`, `useMarkAllRead()` |

### 2.5 Optimistic Update Pattern

For mutations where instant feedback matters (e.g., marking a notification as read, updating epic status via drag-and-drop), use optimistic updates:

```typescript
export function useMarkNotificationRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),

    onMutate: async (notificationId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all })

      // Snapshot previous value
      const previous = queryClient.getQueryData<Notification[]>(
        queryKeys.notifications.list(),
      )

      // Optimistically update
      if (previous) {
        queryClient.setQueryData<Notification[]>(
          queryKeys.notifications.list(),
          previous.map((n) =>
            n.id === notificationId ? { ...n, read: true } : n,
          ),
        )
      }

      return { previous }
    },

    onError: (_err, _id, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.notifications.list(), context.previous)
      }
    },

    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}
```

### 2.6 Invalidation Strategy

When a mutation succeeds, invalidate the appropriate queries. Socket.IO events also trigger invalidations (see Section 3).

| Mutation | Invalidate |
|----------|-----------|
| Create capture | `captures.all(projectId)` |
| Update capture (triage) | `captures.all(projectId)`, `epics.all(projectId)` (if triaged to epic) |
| Delete capture | `captures.all(projectId)` |
| Create epic | `epics.all(projectId)` |
| Update epic | `epics.all(projectId)`, `epics.detail(projectId, epicId)` |
| Create session | `sessions.all(projectId)`, `epics.detail(projectId, epicId)` |
| Cancel session | `sessions.all(projectId)`, `sessions.detail(sessionId)` |
| Answer question | `sessions.detail(sessionId)` |
| Add PR comment | `reviews.detail(sessionId)` |
| Merge PR | `reviews.all(projectId)`, `epics.all(projectId)` |
| Create/update rule | `rules.all(projectId)` |
| Mark notification read | `notifications.all` |

---

## 3. Socket.IO Client Architecture

### 3.1 Singleton Socket Instance

**File:** `src/lib/socket.ts` (rewrite existing)

```typescript
import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
    })
  }
  return socket
}

export function connectSocket(token: string): void {
  const s = getSocket()
  s.auth = { token }
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}

// Room management
export function joinProject(projectId: string): void {
  getSocket().emit('join:project', { projectId })
}

export function joinSession(sessionId: string): void {
  getSocket().emit('join:session', { sessionId })
}

export function leaveSession(sessionId: string): void {
  getSocket().emit('leave:session', { sessionId })
}
```

### 3.2 React Hook: useSocketEvent

**File:** `src/hooks/use-socket-event.ts`

```typescript
import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const socket = getSocket()
    const listener = (data: T) => handlerRef.current(data)

    socket.on(event, listener)
    return () => {
      socket.off(event, listener)
    }
  }, [event])
}
```

### 3.3 Socket-to-Query Integration

**File:** `src/hooks/use-socket-query-sync.ts`

This hook connects Socket.IO events to TanStack Query invalidations. Mount it once inside the authenticated app shell.

```typescript
import { useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from './use-socket-event'
import { queryKeys } from '@/lib/query-keys'
import { useProject } from './use-project'
import { toCamelCase } from '@/lib/case-convert'
import type {
  CaptureCreatedEvent,
  EpicCreatedEvent,
  EpicUpdatedEvent,
  SessionLifecycleEvent,
  SessionEventData,
  NotificationEvent,
  PrEventData,
  BeadsChangedEvent,
} from '@/types/socket-events'

export function useSocketQuerySync(): void {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  // capture:created → invalidate captures list
  useSocketEvent<CaptureCreatedEvent>('capture:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.captures.all(projectId),
    })
  })

  // epic:created → invalidate epics list
  useSocketEvent<EpicCreatedEvent>('epic:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.epics.all(projectId),
    })
  })

  // epic:updated → invalidate epics list + specific detail
  useSocketEvent<EpicUpdatedEvent>('epic:updated', (data) => {
    const event = toCamelCase<{ epic: { id: string } }>(data)
    queryClient.invalidateQueries({
      queryKey: queryKeys.epics.all(projectId),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.epics.detail(projectId, event.epic.id),
    })
  })

  // session:lifecycle → invalidate sessions list + detail
  useSocketEvent<SessionLifecycleEvent>('session:lifecycle', (data) => {
    const event = toCamelCase<{ session: { id: string; epicId: string | null } }>(data)
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.all(projectId),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.detail(event.session.id),
    })
    // Also invalidate the epic if session is linked to one
    if (event.session.epicId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(projectId, event.session.epicId),
      })
    }
  })

  // session:event → append to session events query data (if in cache)
  // NOTE: For live streaming, consider using setQueryData to append rather than
  // invalidate, to avoid refetching the entire event list.
  useSocketEvent<SessionEventData>('session:event', (data) => {
    const event = toCamelCase<{ sessionId: string }>(data)
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.events(event.sessionId),
    })
  })

  // pr:event → invalidate reviews
  useSocketEvent<PrEventData>('pr:event', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.reviews.all(projectId),
    })
  })

  // notification → invalidate notifications
  useSocketEvent<NotificationEvent>('notification', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.notifications.all,
    })
  })

  // beads:changed → invalidate epics + graph
  useSocketEvent<BeadsChangedEvent>('beads:changed', (data) => {
    const event = toCamelCase<{ hint: string }>(data)
    if (event.hint === 'refetch_board') {
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.all(projectId),
      })
    }
    if (event.hint === 'refetch_graph') {
      queryClient.invalidateQueries({
        queryKey: queryKeys.graph.data(projectId),
      })
    }
  })
}
```

### 3.4 Socket Event Types

**File:** `src/types/socket-events.ts`

```typescript
// ─── Server → Client Events ──────────────────────────────────────────────────

export interface CaptureCreatedEvent {
  capture: {
    id: string
    text: string
    status: 'pending'
    user: { id: string; name: string; avatarUrl: string | null }
    createdAt: number
  }
}

export interface EpicCreatedEvent {
  epic: {
    id: string
    beadEpicId: string
    uiStatus: string
    bead: { title: string; priority: number; type: string }
    createdBy: { id: string; name: string }
  }
}

export interface EpicUpdatedEvent {
  epic: {
    id: string
    beadEpicId: string
    uiStatus: string
    prevStatus: string
    bead: Record<string, unknown>
  }
  trigger: 'user' | 'agent' | 'system'
}

export interface SessionLifecycleEvent {
  session: {
    id: string
    epicId: string | null
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    user: { id: string; name: string }
    agentMailName: string | null
    model: string
  }
  event: 'started' | 'completed' | 'failed' | 'cancelled'
}

export interface SessionEventData {
  sessionId: string
  eventId: number
  eventType: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'
  data: Record<string, unknown>
  timestamp: number
}

export interface SessionQuestionEvent {
  sessionId: string
  question: {
    id: string
    text: string
    options: Array<{ label: string; description: string }> | null
    context: string
  }
  mode: 'pause' | 'auto' | 'hybrid'
  riskLevel: 'low' | 'high'
  autoAnswer: string | null
  timeoutSeconds: number | null
}

export interface SessionProgressEvent {
  sessionId: string
  progress: {
    turns: number
    toolsUsed: number
    filesModified: number
    elapsedMs: number
    lastTool: string
  }
}

export interface PrEventData {
  pr: {
    url: string
    title: string
    status: 'created' | 'review_complete' | 'changes_requested' | 'approved' | 'merged'
    epicId: string
    sessionId: string
  }
}

export interface NotificationEvent {
  notification: {
    id: string
    type: 'agent_complete' | 'pr_ready' | 'review_needed' | 'question_waiting' | 'merge_complete'
    title: string
    body: string | null
    link: string | null
    projectId: string
  }
}

export interface QueueUpdatedEvent {
  queue: {
    length: number
    items: Array<{
      id: string
      epicTitle: string
      priority: number
      position: number
      user: { name: string }
    }>
  }
}

export interface BeadsChangedEvent {
  timestamp: number
  hint: 'refetch_board' | 'refetch_graph'
}

export interface BeadsSyncConflictEvent {
  error: string
  details: string
  actionRequired: string
  hostCommand: string
  timestamp: number
}

export interface BeadsSyncResolvedEvent {
  timestamp: number
}

// ─── Client → Server Events ──────────────────────────────────────────────────

export interface JoinProjectPayload {
  projectId: string
}

export interface JoinSessionPayload {
  sessionId: string
}

export interface LeaveSessionPayload {
  sessionId: string
}

export interface SessionAnswerPayload {
  sessionId: string
  questionId: string
  answer: string
}

export interface SessionCancelPayload {
  sessionId: string
}

export interface CaptureCreatePayload {
  projectId: string
  text: string
}
```

### 3.5 Socket Connection Hook

**File:** `src/hooks/use-socket-connection.ts`

Mount once in the app shell after authentication.

```typescript
import { useEffect } from 'react'
import { connectSocket, disconnectSocket, joinProject } from '@/lib/socket'
import { useAuth } from './use-auth'
import { useProject } from './use-project'

export function useSocketConnection(): void {
  const { isAuthenticated, user } = useAuth()
  const { projectId } = useProject()

  useEffect(() => {
    if (!isAuthenticated) return

    // Connect with API key or JWT
    const token = localStorage.getItem('auth_token') ?? ''
    connectSocket(token)

    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated])

  // Join project room when project changes
  useEffect(() => {
    if (!isAuthenticated || !projectId) return
    joinProject(projectId)
  }, [isAuthenticated, projectId])
}
```

---

## 4. Auth Context

### 4.1 AuthProvider

**File:** `src/providers/auth-provider.tsx`

```typescript
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { authApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (apiKey: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // Check auth on mount (via cookie or stored token)
  useEffect(() => {
    authApi
      .me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false))
  }, [])

  const login = useCallback(async (apiKey: string, rememberMe = false) => {
    // Store API key for Bearer auth
    localStorage.setItem('auth_token', apiKey)

    // POST /api/auth/login sets HttpOnly cookie (ctw_session JWT)
    // Server sets cookie expiry: 7 days default, 30 days if rememberMe
    const { user } = await authApi.login(apiKey)
    setUser(user)
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    localStorage.removeItem('auth_token')
    setUser(null)
    queryClient.clear() // Clear all cached data
  }, [queryClient])

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: user !== null,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
```

### 4.2 Route Guards

**File:** `src/components/auth/protected-route.tsx`

```typescript
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/providers/auth-provider'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-ink-muted">
        Loading...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
```

### 4.3 Role-Based Access

**File:** `src/hooks/use-require-role.ts`

```typescript
import { useAuth } from '@/providers/auth-provider'
import type { UserRole } from '@/types'

export function useRequireRole(...allowedRoles: UserRole[]): {
  hasAccess: boolean
  role: UserRole | undefined
} {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined
  const hasAccess = role !== undefined && allowedRoles.includes(role)
  return { hasAccess, role }
}

// Usage in components:
// const { hasAccess } = useRequireRole('pm', 'techlead')
// if (!hasAccess) return <NoPermission />
// Or: <Button disabled={!hasAccess}>Merge PR</Button>
```

---

## 5. Project Context

### 5.1 ProjectProvider

**File:** `src/providers/project-provider.tsx`

```typescript
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { projectsApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'
import type { Project } from '@/types'

interface ProjectState {
  project: Project | null
  projectId: string
  setProjectId: (id: string) => void
  projects: Project[]
  isLoading: boolean
}

const ProjectContext = createContext<ProjectState | null>(null)

const PROJECT_ID_KEY = 'ctw_active_project'

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string>(
    () => localStorage.getItem(PROJECT_ID_KEY) ?? '',
  )

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.projects.list(),
    queryFn: async () => {
      const { projects } = await projectsApi.list()
      return projects
    },
  })

  const projects = data ?? []
  const project = projects.find((p) => p.id === projectId) ?? projects[0] ?? null

  // Auto-select first project if none selected
  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectIdState(projects[0].id)
    }
  }, [projectId, projects])

  const setProjectId = (id: string) => {
    localStorage.setItem(PROJECT_ID_KEY, id)
    setProjectIdState(id)
  }

  return (
    <ProjectContext.Provider
      value={{
        project,
        projectId: project?.id ?? '',
        setProjectId,
        projects,
        isLoading,
      }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject(): ProjectState {
  const context = useContext(ProjectContext)
  if (!context) {
    throw new Error('useProject must be used within ProjectProvider')
  }
  return context
}
```

### 5.2 Provider Hierarchy

Update `src/main.tsx`:

```typescript
<StrictMode>
  <BrowserRouter>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <ProjectProvider>
                  <AppShell />
                </ProjectProvider>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
      {import.meta.env.DEV && <ReactQueryDevtools />}
    </QueryClientProvider>
  </BrowserRouter>
</StrictMode>
```

Where `AppShell` mounts the socket connection, socket-query sync, and renders `<Layout />` with routes:

```typescript
// src/components/app-shell.tsx
function AppShell() {
  useSocketConnection()
  useSocketQuerySync()

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/board" replace />} />
        <Route path="/board" element={<BoardPage />} />
        <Route path="/captures" element={<CapturesPage />} />
        <Route path="/agents" element={<AgentsPage />} />
        <Route path="/agents/:sessionId" element={<AgentStreamPage />} />
        <Route path="/graph" element={<GraphPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/review/:prNumber" element={<PrReviewPage />} />
      </Route>
    </Routes>
  )
}
```

---

## 6. Shared TypeScript Types

**File:** `src/types/index.ts`

All types use camelCase to match the frontend convention. The API client handles snake_case conversion automatically.

```typescript
// ─── Enums / Unions ───────────────────────────────────────────────────────────

export type UserRole = 'pm' | 'dev' | 'techlead' | 'viewer'

export type UiStatus = 'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

export type CaptureStatus = 'pending' | 'triaged' | 'deferred' | 'dismissed'

export type SessionStatus =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'validation_failed'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'detached'

export type SessionEventType = 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'

export type NotificationType =
  | 'agent_complete'
  | 'pr_ready'
  | 'review_needed'
  | 'question_waiting'
  | 'merge_complete'

export type RuleCategory = 'coding' | 'security' | 'testing' | 'architecture' | 'general'
export type RuleMaturity = 'candidate' | 'established' | 'proven' | 'deprecated'

export type AskQuestionMode = 'pause' | 'auto' | 'hybrid'

export type PrStatus = 'pending_review' | 'changes_requested' | 'approved' | 'merged'

// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string | null
  role: UserRole
  avatarUrl: string | null
  createdAt: number
  updatedAt: number
}

export interface Project {
  id: string
  name: string
  slug: string
  projectRoot: string
  maxConcurrentAgents: number
  askQuestionMode: AskQuestionMode
  createdAt: number
  updatedAt: number
}

export interface Repo {
  id: string
  projectId: string
  name: string
  gitUrl: string | null
  path: string
  defaultBranch: string
  linkMode: 'clone' | 'symlink'
  status: 'cloning' | 'ready' | 'error'
  addedBy: string
  createdAt: number
}

export interface Capture {
  id: string
  projectId: string
  userId: string
  text: string
  status: CaptureStatus
  triageResult: string | null // JSON string, parse in app code
  createdAt: number
  triagedAt: number | null
  triagedBy: string | null
  // Denormalized from join:
  user?: { id: string; name: string; avatarUrl: string | null }
}

export interface Epic {
  id: string
  projectId: string
  beadEpicId: string
  gitBranches: Array<{ repo: string; branch: string }>
  uiStatus: UiStatus
  scopeAnalysis: string | null // JSON string
  splitProposal: string | null // JSON string
  createdAt: number
  updatedAt: number
  // Denormalized from br show:
  bead?: {
    title: string
    description: string
    priority: number
    status: string
    type: string
    labels: string[]
    children: Array<{
      id: string
      title: string
      status: string
      priority: number
      type: string
    }>
  }
  // Denormalized from sessions join:
  activeSession?: { id: string; status: SessionStatus; agentMailName: string | null } | null
  prUrl?: string | null
  prStatus?: PrStatus | null
}

export interface AgentSession {
  id: string
  projectId: string
  epicId: string | null
  userId: string
  claudeSessionId: string | null
  agentMailName: string | null
  model: string
  status: SessionStatus
  prompt: string
  pid: number | null
  exitCode: number | null
  prUrl: string | null
  prStatus: PrStatus | null
  startedAt: number | null
  finishedAt: number | null
  createdAt: number
  // Denormalized from joins:
  epic?: { id: string; beadEpicId: string; bead?: { title: string } } | null
  user?: { id: string; name: string }
  queuePosition?: number // When status === 'queued'
}

export interface SessionEvent {
  id: number
  sessionId: string
  eventType: SessionEventType
  data: Record<string, unknown> // Raw JSON from claude stream
  createdAt: number
}

export interface Notification {
  id: string
  userId: string
  projectId: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: number
}

export interface KnowledgeRule {
  id: string
  projectId: string
  ruleText: string
  category: RuleCategory
  confidence: number
  maturity: RuleMaturity
  source: 'manual' | 'auto'
  sourceSessionId: string | null
  approvedBy: string | null
  helpfulCount: number
  harmfulCount: number
  lastValidatedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface WebhookConfig {
  id: string
  projectId: string
  type: 'slack' | 'discord'
  url: string
  events: string[] // Parsed from JSON string
  enabled: boolean
  createdAt: number
}

// ─── Graph Types ──────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  title: string
  status: string
  priority: number
  type: string
  assignee?: string
}

export interface GraphEdge {
  source: string
  target: string
  type: 'blocks'
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  insights: {
    criticalPath: string[]
    bottlenecks: Array<{ id: string; betweenness: number }>
    ready: string[]
  }
}

// ─── Scope Analysis ───────────────────────────────────────────────────────────

export interface ScopeAnalysis {
  estimatedTokens: number
  filesAffected: number
  complexity: 'low' | 'medium' | 'high'
  recommendation: 'single' | 'split'
  proposedBeads: Array<{
    title: string
    priority: number
    files: string[]
  }>
}

// ─── PR Review ────────────────────────────────────────────────────────────────

export interface PrReview {
  pr: {
    url: string
    title: string
    branch: string
  }
  diff: {
    files: Array<{
      path: string
      additions: number
      deletions: number
      patch: string
    }>
  }
  aiReview: {
    status: string
    comments: Array<{
      file: string
      line: number
      body: string
      severity: 'low' | 'medium' | 'high'
    }>
    checks: {
      ubs: string
      security: string
      standards: string
    }
  }
  humanComments: Array<{
    id: string
    file: string
    line: number
    body: string
    user: { id: string; name: string }
    createdAt: number
  }>
}

// ─── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}
```

Re-export socket events from the types barrel:

```typescript
// src/types/index.ts (at the bottom)
export type * from './socket-events'
```

---

## 7. Error Handling Patterns

### 7.1 Global Error Handler for API

**File:** `src/lib/api-error-handler.ts`

```typescript
import { toast } from 'sonner'
import { ApiError } from './api-error'

export function handleApiError(error: unknown): void {
  if (!(error instanceof ApiError)) {
    // Network error or unexpected failure
    toast.error('Connection lost', {
      description: 'Check your network connection and try again.',
      action: {
        label: 'Retry',
        onClick: () => window.location.reload(),
      },
    })
    return
  }

  switch (error.status) {
    case 401:
      // Unauthorized — redirect to login
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
      break

    case 403:
      toast.error('Permission denied', {
        description: "You don't have permission to perform this action.",
      })
      break

    case 400:
      if (error.issues && error.issues.length > 0) {
        // Validation errors from zod
        const messages = error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
        toast.error('Validation error', {
          description: messages.join('\n'),
        })
      } else {
        toast.error('Bad request', {
          description: error.errorMessage,
        })
      }
      break

    case 404:
      toast.error('Not found', {
        description: error.errorMessage,
      })
      break

    case 409:
      toast.error('Conflict', {
        description: error.errorMessage,
      })
      break

    default:
      toast.error('Something went wrong', {
        description: error.errorMessage || 'An unexpected error occurred.',
        action: {
          label: 'Retry',
          onClick: () => window.location.reload(),
        },
      })
  }
}
```

### 7.2 QueryClient Error Integration

Configure the QueryClient to use the global error handler for mutations:

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
    mutations: {
      retry: 0,
      onError: (error) => handleApiError(error),
    },
  },
})
```

### 7.3 Error Boundary

**File:** `src/components/error-boundary.tsx`

```typescript
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 p-8">
          <AlertTriangle className="h-12 w-12 text-status-error" />
          <h2 className="text-lg font-semibold text-ink">Something went wrong</h2>
          <p className="max-w-md text-center text-sm text-ink-muted">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <Button
            variant="outline"
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.reload()
            }}
          >
            Reload page
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
```

---

## 8. Shared UI Patterns

### 8.1 Loading Skeletons

**File:** `src/components/ui/skeleton.tsx`

```typescript
import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-surface-2', className)}
      {...props}
    />
  )
}
```

**File:** `src/components/skeletons/epic-card-skeleton.tsx`

```typescript
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export function EpicCardSkeleton() {
  return (
    <Card className="border-surface-3">
      <CardHeader className="space-y-2 pb-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-10" /> {/* Priority badge */}
          <Skeleton className="h-5 w-14" /> {/* Type badge */}
        </div>
        <Skeleton className="h-5 w-3/4" /> {/* Title */}
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-2 w-full" /> {/* Progress bar */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-full" /> {/* Avatar */}
          <Skeleton className="h-4 w-20" /> {/* Labels */}
        </div>
      </CardContent>
    </Card>
  )
}
```

Implement similar skeletons for `SessionCardSkeleton`, `CaptureCardSkeleton`, `RuleCardSkeleton`.

### 8.2 Empty States

**File:** `src/components/ui/empty-state.tsx`

```typescript
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  icon: LucideIcon
  heading: string
  description: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({ icon: Icon, heading, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-xl bg-surface-2 p-4">
        <Icon className="h-8 w-8 text-ink-muted" />
      </div>
      <h3 className="text-sm font-medium text-ink">{heading}</h3>
      <p className="max-w-xs text-sm text-ink-muted">{description}</p>
      {action && (
        <Button variant="outline" size="sm" onClick={action.onClick} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  )
}

// Usage:
// <EmptyState
//   icon={Inbox}
//   heading="No captures yet"
//   description="Capture ideas, bugs, and feature requests for your project."
//   action={{ label: "New Capture", onClick: openComposer }}
// />
```

### 8.3 Toast Conventions

Use `sonner` toast (already in the project). Follow these conventions:

```typescript
import { toast } from 'sonner'

// Success — green. Use for completed actions.
toast.success('Epic created', {
  description: 'Rate Limiting has been added to the board.',
})

// Error — red. Use for failed actions.
toast.error('Failed to create epic', {
  description: 'The server returned an error. Please try again.',
})

// Info — blue. Use for informational messages.
toast.info('Session queued', {
  description: 'Your agent session is #3 in the queue.',
})

// Warning — amber. Use for non-blocking warnings.
toast.warning('Approaching concurrency limit', {
  description: '2 of 3 agent slots are in use.',
})

// With action
toast.error('Connection lost', {
  action: {
    label: 'Retry',
    onClick: () => window.location.reload(),
  },
})
```

### 8.4 Confirmation Dialog

**File:** `src/components/ui/confirm-dialog.tsx`

```typescript
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
  onConfirm: () => void
  isLoading?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'default' : 'default'}
            className={variant === 'destructive' ? 'bg-status-error hover:bg-status-error/90' : ''}
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Usage:
// <ConfirmDialog
//   open={showDelete}
//   onOpenChange={setShowDelete}
//   title="Remove repository?"
//   description="This will remove the repo from the project. The files on disk will not be deleted."
//   confirmLabel="Remove"
//   variant="destructive"
//   onConfirm={() => removeRepo.mutate(repoName)}
//   isLoading={removeRepo.isPending}
// />
```

---

## 9. File Structure Summary

After implementing this spec, the following files should exist in `packages/client/src/`:

```
src/
  lib/
    api.ts                   # Enhanced API client with case conversion
    api-error.ts             # ApiError class
    api-error-handler.ts     # Global error handler
    case-convert.ts          # snake_case <-> camelCase utilities
    query-keys.ts            # Query key factory
    resources.ts             # Resource API objects (per-domain)
    socket.ts                # Socket.IO singleton + room helpers
    utils.ts                 # cn() helper (existing)
  types/
    index.ts                 # All domain types
    socket-events.ts         # Socket.IO event payload types
  providers/
    auth-provider.tsx        # AuthProvider + useAuth()
    project-provider.tsx     # ProjectProvider + useProject()
  hooks/
    use-auth.ts              # Re-export from provider (convenience)
    use-project.ts           # Re-export from provider (convenience)
    use-require-role.ts      # Role-based access hook
    use-socket-event.ts      # Generic socket event listener
    use-socket-connection.ts # Socket connect/disconnect lifecycle
    use-socket-query-sync.ts # Socket events -> query invalidation
    use-epics.ts             # useEpics(), useEpic(), useCreateEpic(), useUpdateEpic()
    use-captures.ts          # useCaptures(), useCreateCapture(), etc.
    use-sessions.ts          # useSessions(), useSession(), useSessionEvents(), etc.
    use-repos.ts             # useRepos(), useCloneRepo(), etc.
    use-reviews.ts           # useReviews(), useReview(), etc.
    use-graph.ts             # useGraph(), useGraphTriage(), etc.
    use-rules.ts             # useRules(), useCreateRule(), etc.
    use-webhooks.ts          # useWebhooks(), useCreateWebhook()
    use-notifications.ts     # useNotifications(), useMarkRead(), etc.
  components/
    app-shell.tsx            # Mounts socket + query sync + Layout
    error-boundary.tsx       # React error boundary
    auth/
      protected-route.tsx    # Auth route guard
    ui/
      skeleton.tsx           # Base skeleton component
      empty-state.tsx        # Empty state pattern
      confirm-dialog.tsx     # Confirmation dialog for destructive actions
    skeletons/
      epic-card-skeleton.tsx
      session-card-skeleton.tsx
      capture-card-skeleton.tsx
```

---

## 10. Migration Path from Demo

The demo (`ui/src/`) uses static data imports from `ui/src/data/`. When migrating page components to `packages/client/src/`:

1. Replace `import { epics } from '@/data/epics'` with `const { data: epics } = useEpics()`
2. Replace Zustand stores holding server data (e.g., `useCaptureStore.captures`) with TanStack Query hooks
3. Keep Zustand stores that hold **UI-only state** (filters, selections, sidebar open/closed)
4. Replace direct `toast()` calls on mutations with the mutation `onSuccess`/`onError` hooks
5. Wrap each page with loading/error states using `isLoading` and `isError` from query hooks

**Example migration (BoardPage):**

```typescript
// BEFORE (demo):
import { epics, columns, getEpicsByStatus } from '@/data/epics'

export function BoardPage() {
  const epicsInColumn = getEpicsByStatus('ready')
  // ...
}

// AFTER (production):
import { useEpics } from '@/hooks/use-epics'
import { columns } from '@/types' // Static column config
import { EpicCardSkeleton } from '@/components/skeletons/epic-card-skeleton'

export function BoardPage() {
  const { data: epics, isLoading, isError } = useEpics()

  if (isLoading) return <BoardSkeleton />
  if (isError) return <ErrorState />

  const epicsInColumn = epics?.filter((e) => e.uiStatus === 'ready') ?? []
  // ...
}
```
