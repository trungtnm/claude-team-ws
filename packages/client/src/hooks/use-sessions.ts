import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

export interface SessionSummary {
  id: string
  project_id: string
  epic_id: string | null
  user_id: string
  claude_session_id: string | null
  agent_mail_name: string | null
  model: string
  status: 'queued' | 'running' | 'waiting_input' | 'validation_failed' | 'completed' | 'failed' | 'cancelled' | 'detached'
  prompt: string
  pid: number | null
  pr_url: string | null
  pr_status: string | null
  started_at: number | null
  finished_at: number | null
  created_at: number
}

export const sessionKeys = {
  all: (projectId: string) => ['sessions', projectId] as const,
  detail: (projectId: string, sessionId: string) => ['sessions', projectId, sessionId] as const,
  events: (projectId: string, sessionId: string) => ['sessions', projectId, sessionId, 'events'] as const,
}

export function useSessionsQuery(projectId: string) {
  return useQuery<SessionSummary[]>({
    queryKey: sessionKeys.all(projectId),
    queryFn: () =>
      api.get<{ sessions: SessionSummary[] }>(`/projects/${projectId}/sessions`).then((r) => r.sessions),
    refetchInterval: 10000,
  })
}

export function useSessionQuery(projectId: string, sessionId: string | undefined) {
  return useQuery<SessionSummary>({
    queryKey: sessionKeys.detail(projectId, sessionId!),
    queryFn: () =>
      api.get<{ session: SessionSummary }>(`/projects/${projectId}/sessions/${sessionId}`).then((r) => r.session),
    enabled: !!sessionId,
    refetchInterval: 5000,
  })
}

export function useCreateSessionMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { epic_id: string; prompt: string; model?: string }) =>
      api.post<{ session: SessionSummary }>(`/projects/${projectId}/sessions`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(projectId) })
    },
  })
}

export function useCancelSessionMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      api.post(`/projects/${projectId}/sessions/${sessionId}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(projectId) })
    },
  })
}

export function useAnswerSessionMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sessionId, answer }: { sessionId: string; answer: string }) =>
      api.post(`/projects/${projectId}/sessions/${sessionId}/answer`, { answer }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(projectId, sessionId) })
    },
  })
}

export function useSessionSocket(projectId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = getSocket()

    function onSessionLifecycle(data: { sessionId: string }) {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(projectId, data.sessionId) })
    }

    function onSessionQuestion(data: { sessionId: string }) {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(projectId) })
      queryClient.invalidateQueries({ queryKey: sessionKeys.detail(projectId, data.sessionId) })
    }

    socket.on('session:lifecycle', onSessionLifecycle)
    socket.on('session:question', onSessionQuestion)

    return () => {
      socket.off('session:lifecycle', onSessionLifecycle)
      socket.off('session:question', onSessionQuestion)
    }
  }, [projectId, queryClient])
}
