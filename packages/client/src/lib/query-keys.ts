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
    capabilities: (projectId: string) =>
      [...queryKeys.sessions.all(projectId), 'capabilities'] as const,
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

  // Members (scoped to project)
  members: {
    all: (projectId: string) => ['members', { projectId }] as const,
    list: (projectId: string) => [...queryKeys.members.all(projectId), 'list'] as const,
  },

  // Activity (scoped to project)
  activity: {
    all: (projectId: string) => ['activity', { projectId }] as const,
    list: (projectId: string, action?: string) =>
      [...queryKeys.activity.all(projectId), 'list', { action }] as const,
    metrics: (projectId: string) =>
      [...queryKeys.activity.all(projectId), 'metrics'] as const,
  },

  // Notifications (user-scoped, no projectId)
  notifications: {
    all: ['notifications'] as const,
    list: (params?: { read?: boolean }) => ['notifications', 'list', params] as const,
  },
} as const
