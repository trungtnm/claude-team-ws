import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { getSocket } from '@/lib/socket'

export interface Epic {
  id: string
  project_id: string
  bead_epic_id: string
  git_branches: string
  ui_status: 'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done' | 'cancelled'
  scope_analysis: string | null
  split_proposal: string | null
  created_at: number
  updated_at: number
  bead?: {
    title: string
    description?: string
    priority: number
    status: string
    labels: string[]
  }
}

export const epicKeys = {
  all: (projectId: string) => ['epics', projectId] as const,
  detail: (projectId: string, epicId: string) => ['epics', projectId, epicId] as const,
}

export function useEpicsQuery(projectId: string) {
  return useQuery<Epic[]>({
    queryKey: epicKeys.all(projectId),
    queryFn: () =>
      api.get<{ epics: Epic[] }>(`/projects/${projectId}/epics`).then((r) => r.epics),
    refetchInterval: 30000,
  })
}

export function useUpdateEpicMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ epicId, ...data }: { epicId: string; ui_status?: string }) =>
      api.patch(`/projects/${projectId}/epics/${epicId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: epicKeys.all(projectId) })
    },
  })
}

export function useEpicSocket(projectId: string) {
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = getSocket()

    function onEpicEvent() {
      queryClient.invalidateQueries({ queryKey: epicKeys.all(projectId) })
    }

    socket.on('epic:created', onEpicEvent)
    socket.on('epic:updated', onEpicEvent)

    return () => {
      socket.off('epic:created', onEpicEvent)
      socket.off('epic:updated', onEpicEvent)
    }
  }, [projectId, queryClient])
}
