import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { sessionsApi } from '@/lib/resources'
import { joinSession, leaveSession } from '@/lib/socket'
import { useProject } from '@/providers/project-provider'
import type { AgentSession, SessionEvent, Attachment } from '@/types'

// ── Queries ───────────────────────────────────────────────────────────────

export function useSessionsQuery(filters?: { status?: string; epicId?: string }) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.sessions.list(projectId, filters),
    queryFn: async () => {
      const { sessions } = await sessionsApi.list(projectId, filters)
      return sessions
    },
    enabled: !!projectId,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
  })
}

export function useSessionQuery(sessionId: string | undefined) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId!),
    queryFn: async () => {
      const { session } = await sessionsApi.get(projectId, sessionId!)
      return session
    },
    enabled: !!sessionId && !!projectId,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  })
}

export function useSessionEventsQuery(
  sessionId: string | undefined,
  params?: { afterId?: number; eventType?: string },
) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.sessions.events(sessionId!, params),
    queryFn: async () => {
      const result = await sessionsApi.events(projectId, sessionId!, params)
      return result
    },
    enabled: !!sessionId && !!projectId,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

export function useCapabilitiesQuery() {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.sessions.capabilities(projectId),
    queryFn: async () => {
      const { capabilities } = await sessionsApi.capabilities(projectId)
      return capabilities
    },
    enabled: !!projectId,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  })
}

export function useCreateSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: {
      prompt: string
      model?: string
      name?: string
      epicId?: string
      permission_mode?: string
      target_dir?: string
    }) =>
      sessionsApi.create(projectId, {
        epicId: data.epicId,
        model: data.model,
        name: data.name,
        prompt: data.prompt,
        permission_mode: data.permission_mode,
        target_dir: data.target_dir,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to create session: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useCancelSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (sessionId: string) => sessionsApi.cancel(projectId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to cancel session: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useResumeSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ sessionId, prompt }: { sessionId: string; prompt: string }) =>
      sessionsApi.resume(projectId, sessionId, { prompt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to resume session: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useAnswerSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ sessionId, answer }: { sessionId: string; answer: string }) =>
      sessionsApi.answer(projectId, sessionId, { answer }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.detail(variables.sessionId),
      })
    },
    onError: (err) => {
      toast.error(`Failed to send answer: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useInterruptSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (sessionId: string) => sessionsApi.interrupt(projectId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
      // No toast — the status badge and input placeholder update seamlessly
    },
    onError: (err) => {
      toast.error(`Failed to interrupt: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useCompleteSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (sessionId: string) => sessionsApi.complete(projectId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to complete session: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useDeleteSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (sessionId: string) => sessionsApi.delete(projectId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
      toast.success('Session deleted')
    },
    onError: (err) => {
      toast.error(`Failed to delete session: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useBulkDeleteSessionsMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: () => sessionsApi.bulkDelete(projectId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(projectId) })
      toast.success(`Cleared ${(data as { deleted: number }).deleted} sessions`)
    },
    onError: (err) => {
      toast.error(`Failed to clear sessions: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useSendMessageMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ sessionId, message, attachments }: {
      sessionId: string
      message: string
      attachments?: Attachment[]
    }) =>
      sessionsApi.sendMessage(projectId, sessionId, { message, attachments }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(variables.sessionId) })
    },
    onError: (err) => {
      toast.error(`Failed to send message: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useSetPermissionModeMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ sessionId, mode }: { sessionId: string; mode: string }) =>
      sessionsApi.setPermissionMode(projectId, sessionId, { mode }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.detail(variables.sessionId) })
    },
    onError: (err) => {
      toast.error(`Failed to set permission mode: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

// ── Session Room Hook ─────────────────────────────────────────────────────

/** Join a Socket.IO session room while a session is selected, leave on cleanup */
export function useSessionRoom(sessionId: string | undefined): void {
  useEffect(() => {
    if (!sessionId) return
    joinSession(sessionId)
    return () => {
      leaveSession(sessionId)
    }
  }, [sessionId])
}

// ── Helpers ───────────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_input', 'idle'])
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export function isActiveSession(session: AgentSession): boolean {
  return ACTIVE_STATUSES.has(session.status)
}

export function isTerminalSession(session: AgentSession): boolean {
  return TERMINAL_STATUSES.has(session.status)
}

/** Parse raw session event data JSON into a StreamEvent-like shape */
export function parseSessionEvent(event: SessionEvent): ParsedStreamEvent {
  let data: Record<string, unknown> = {}
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : (event.data as Record<string, unknown>)
  } catch {
    data = { content: String(event.data) }
  }
  // User messages are stored as event_type='system' with data.type='user_message'
  // Override the parsed type so they render with the correct user message style
  const resolvedType = event.eventType === 'system' && data.type === 'user_message'
    ? 'user_message'
    : event.eventType

  return {
    id: event.id,
    type: resolvedType,
    content: (data.content as string) ?? '',
    toolName: data.toolName as string | undefined,
    toolInput: data.toolInput as string | undefined,
    toolResult: data.toolResult as string | undefined,
    timestamp: event.createdAt,
    attachments: data.attachments as ParsedStreamEvent['attachments'],
    questionData: data.questionData as ParsedStreamEvent['questionData'],
    contextWindow: data.contextWindow as ParsedStreamEvent['contextWindow'],
  }
}

export interface ParsedStreamEvent {
  id: number
  type: string
  content: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  timestamp: number
  attachments?: Array<{ type: 'image' | 'file'; name: string; mimeType: string; data: string }>
  questionData?: {
    text: string
    options: string[]
    context: string
  }
  contextWindow?: {
    contextWindowSize: number
    usedPercentage: number
    currentUsage: {
      inputTokens: number
      outputTokens: number
      cacheCreationInputTokens: number
      cacheReadInputTokens: number
    } | null
  }
}
