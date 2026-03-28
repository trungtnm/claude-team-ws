import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { epicsApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'
import { useProject } from '@/providers/project-provider'
import type { Epic as ServerEpic, BoardEpic as Epic, UiStatus, Priority, EpicType } from '@/types'

// ─── Server → UI transforms ────────────────────────────────────────────────────

const VALID_UI_STATUSES = new Set<string>(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled'])

/** Transform server epic response → flat UI Epic used by board components */
export function toUIEpic(serverEpic: ServerEpic): Epic {
  let agentStatus: Epic['agentStatus'] = undefined
  if (serverEpic.activeSession) {
    const s = serverEpic.activeSession.status
    if (s === 'running') agentStatus = 'running'
    else if (s === 'waiting_input') agentStatus = 'waiting_input'
    else if (s === 'idle') agentStatus = 'idle'
  }

  let prNumber: number | undefined
  if (serverEpic.prUrl) {
    const match = serverEpic.prUrl.match(/\/pull\/(\d+)/)
    if (match) prNumber = parseInt(match[1], 10)
  }

  return {
    id: serverEpic.id,
    title: serverEpic.title || 'Untitled',
    description: serverEpic.description || '',
    uiStatus: VALID_UI_STATUSES.has(serverEpic.uiStatus) ? serverEpic.uiStatus as UiStatus : 'blocked',
    priority: ([0, 1, 2, 3].includes(serverEpic.priority) ? serverEpic.priority : 2) as Priority,
    type: (['feature', 'bug', 'task', 'docs'].includes(serverEpic.type) ? serverEpic.type : 'task') as EpicType,
    labels: Array.isArray(serverEpic.labels) ? serverEpic.labels : [],
    assignee: serverEpic.assignee ?? null,
    agentStatus,
    activeSessionId: serverEpic.activeSession?.id,
    prUrl: serverEpic.prUrl ?? undefined,
    prNumber,
    prStatus: serverEpic.prStatus as Epic['prStatus'],
    gitBranch: serverEpic.gitBranches?.[0],
    createdAt: serverEpic.createdAt,
    updatedAt: serverEpic.updatedAt,
  }
}

// ─── Epic detail with sessions ────────────────────────────────────────────────

export interface EpicDetail extends Epic {
  sessions: Array<{
    id: string
    status: string
    name: string
    duration: number
    model: string
  }>
}

function toEpicDetail(serverEpic: ServerEpic): EpicDetail {
  const uiEpic = toUIEpic(serverEpic)

  const rawSessions = serverEpic.sessions ?? []
  const sessions = rawSessions.map((s) => ({
    id: s.id,
    status: s.status,
    name: s.agentMailName ?? s.model ?? 'Session',
    duration: s.finishedAt && s.startedAt
      ? s.finishedAt - s.startedAt
      : s.startedAt
        ? Math.floor(Date.now() / 1000) - s.startedAt
        : 0,
    model: String(s.model ?? 'sonnet'),
  }))

  return { ...uiEpic, sessions }
}

// ─── Query hooks ────────────────────────────────────────────────────────────────

export function useEpics() {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.epics.list(projectId),
    queryFn: async () => {
      const { epics } = await epicsApi.list(projectId)
      return epics.map(toUIEpic)
    },
    enabled: !!projectId,
  })
}

export function useEpicDetail(epicId: string | null) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: epicId ? queryKeys.epics.detail(projectId, epicId) : ['epics', 'disabled'],
    queryFn: async () => {
      if (!epicId) return null
      const { epic } = await epicsApi.get(projectId, epicId)
      return toEpicDetail(epic)
    },
    enabled: !!projectId && !!epicId,
  })
}

// ─── Mutation hooks ─────────────────────────────────────────────────────────────

export function useCreateEpic() {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: {
      title: string
      description: string
      priority: number
      labels: string[]
      type?: string
    }) => {
      const { epic } = await epicsApi.create(projectId, data)
      return toUIEpic(epic)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.epics.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to create epic: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export interface UpdateEpicInput {
  epicId: string
  title?: string
  description?: string
  priority?: number
  type?: string
  labels?: string[]
  assignee?: string | null
  uiStatus?: string
  gitBranches?: string[]
}

export function useUpdateEpic() {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ epicId, ...data }: UpdateEpicInput) => {
      const { epic } = await epicsApi.update(projectId, epicId, data)
      return toUIEpic(epic)
    },
    onSuccess: (_, { epicId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.epics.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(projectId, epicId),
      })
    },
    onError: (err) => {
      toast.error(`Failed to update epic: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}
