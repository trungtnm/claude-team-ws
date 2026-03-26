import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { epicsApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'
import { useProject } from '@/providers/project-provider'
import type { Epic as ServerEpic } from '@/types'
import type { Epic, UiStatus, Priority, EpicType } from '@/data/epics'
import type { Bead, BeadStatus, BeadType } from '@/data/beads'

// ─── Server → UI transforms ────────────────────────────────────────────────────

/** Transform server epic response → flat UI Epic used by board components */
export function toUIEpic(serverEpic: ServerEpic): Epic {
  const bead = serverEpic.bead
  const raw = bead as Record<string, unknown> | undefined

  // br show returns children for epic-type beads
  const children = raw?.children as Array<{ status: string }> | undefined
  const total = children?.length ?? 0
  const done = children?.filter((c) => c.status === 'done' || c.status === 'closed').length ?? 0

  let agentStatus: Epic['agentStatus'] = undefined
  if (serverEpic.activeSession) {
    const s = serverEpic.activeSession.status
    if (s === 'running') agentStatus = 'running'
    else if (s === 'waiting_input') agentStatus = 'waiting_input'
  }

  let prNumber: number | undefined
  if (serverEpic.prUrl) {
    const match = serverEpic.prUrl.match(/\/pull\/(\d+)/)
    if (match) prNumber = parseInt(match[1], 10)
  }

  return {
    id: serverEpic.id,
    beadId: serverEpic.beadEpicId,
    title: bead?.title ?? 'Untitled',
    description: bead?.description ?? '',
    uiStatus: VALID_UI_STATUSES.has(serverEpic.uiStatus) ? serverEpic.uiStatus as UiStatus : 'blocked',
    priority: ([0, 1, 2, 3].includes(bead?.priority ?? 2) ? bead!.priority : 2) as Priority,
    type: (['feature', 'bug', 'task', 'docs'].includes(bead?.type ?? 'task') ? bead!.type : 'task') as EpicType,
    labels: safeStringArray(bead?.labels),
    assigneeId: '',
    beadProgress: { total, done },
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

const VALID_BEAD_STATUSES = new Set<string>(['open', 'in_progress', 'done', 'blocked'])
const VALID_BEAD_TYPES = new Set<string>(['task', 'bug', 'spike'])
const VALID_UI_STATUSES = new Set<string>(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled'])

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

/** Transform bead child from br show → UI Bead used by BeadList */
export function toUIBead(child: Record<string, unknown>, epicId: string): Bead {
  const status = typeof child.status === 'string' && VALID_BEAD_STATUSES.has(child.status)
    ? child.status as BeadStatus
    : 'open'
  const type = typeof child.type === 'string' && VALID_BEAD_TYPES.has(child.type)
    ? child.type as BeadType
    : 'task'

  return {
    id: String(child.id ?? ''),
    epicId,
    title: String(child.title ?? ''),
    description: String(child.description ?? ''),
    status,
    priority: Number(child.priority ?? 2),
    type,
    assigneeId: typeof child.assigneeId === 'string' ? child.assigneeId : undefined,
    labels: safeStringArray(child.labels),
    dependencies: safeStringArray(child.dependencies),
    createdAt: Number(child.createdAt ?? 0),
    updatedAt: Number(child.updatedAt ?? 0),
  }
}

// ─── Epic detail with beads + sessions ──────────────────────────────────────────

export interface EpicDetail extends Epic {
  beads: Bead[]
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
  const raw = serverEpic.bead as Record<string, unknown> | undefined
  const children = (raw?.children as Record<string, unknown>[]) ?? []
  const beads = children.map((c) => toUIBead(c, serverEpic.id))

  // Sessions come from the detail endpoint (not in the base Epic type)
  const rawSessions = (serverEpic as unknown as Record<string, unknown>).sessions as
    | Array<Record<string, unknown>>
    | undefined
  const sessions = (rawSessions ?? []).map((s) => ({
    id: String(s.id ?? ''),
    status: String(s.status ?? 'queued'),
    name: String(s.agentMailName ?? s.model ?? 'Session'),
    duration: s.finishedAt && s.startedAt
      ? Number(s.finishedAt) - Number(s.startedAt)
      : s.startedAt
        ? Math.floor(Date.now() / 1000) - Number(s.startedAt)
        : 0,
    model: String(s.model ?? 'sonnet'),
  }))

  return { ...uiEpic, beads, sessions }
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
    }) => {
      const { epic } = await epicsApi.create(projectId, { ...data, repos: [] })
      return toUIEpic(epic)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.epics.all(projectId) })
    },
  })
}

export function useUpdateEpic() {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      epicId,
      ...data
    }: {
      epicId: string
      uiStatus?: string
      gitBranches?: string[]
    }) => {
      const { epic } = await epicsApi.update(
        projectId,
        epicId,
        data as Partial<ServerEpic>,
      )
      return toUIEpic(epic)
    },
    onSuccess: (_, { epicId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.epics.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(projectId, epicId),
      })
    },
  })
}
