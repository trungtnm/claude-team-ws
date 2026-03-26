import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { sessionsApi } from '@/lib/resources'
import { joinSession, leaveSession } from '@/lib/socket'
import { useProject } from '@/providers/project-provider'
import type { AgentSession, SessionEvent } from '@/types'

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
  return useQuery({
    queryKey: queryKeys.sessions.detail(sessionId!),
    queryFn: async () => {
      const { session } = await sessionsApi.get(sessionId!)
      return session
    },
    enabled: !!sessionId,
    refetchInterval: 3_000,
    refetchIntervalInBackground: false,
  })
}

export function useSessionEventsQuery(
  sessionId: string | undefined,
  params?: { afterId?: number; eventType?: string },
) {
  return useQuery({
    queryKey: queryKeys.sessions.events(sessionId!, params),
    queryFn: async () => {
      const result = await sessionsApi.events(sessionId!, params)
      return result
    },
    enabled: !!sessionId,
    refetchInterval: 2_000,
    refetchIntervalInBackground: false,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

export function useCreateSessionMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: { prompt: string; model?: string; name?: string; epicId?: string }) =>
      sessionsApi.create(projectId, {
        epicId: data.epicId,
        model: data.model,
        name: data.name,
        prompt: data.prompt,
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
    mutationFn: (sessionId: string) => sessionsApi.cancel(sessionId),
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
      sessionsApi.resume(sessionId, { prompt }),
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
      sessionsApi.answer(sessionId, { answer }),
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

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_input'])
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
  return {
    id: event.id,
    type: event.eventType,
    content: (data.content as string) ?? '',
    toolName: data.toolName as string | undefined,
    toolInput: data.toolInput as string | undefined,
    toolResult: data.toolResult as string | undefined,
    timestamp: event.createdAt,
    attachments: data.attachments as ParsedStreamEvent['attachments'],
    questionData: data.questionData as ParsedStreamEvent['questionData'],
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
}
