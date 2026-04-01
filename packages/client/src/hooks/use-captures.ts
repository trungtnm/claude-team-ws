import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { capturesApi } from '@/lib/resources'
import { useProject } from '@/providers/project-provider'
import type { Capture } from '@/types'

// ── Queries ───────────────────────────────────────────────────────────────

export function useCapturesQuery(status?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.captures.list(projectId, status),
    queryFn: async () => {
      const { captures } = await capturesApi.list(projectId, { status })
      return captures
    },
    enabled: !!projectId,
  })
}

// ── Mutations ─────────────────────────────────────────────────────────────

export function useCreateCaptureMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: { text: string; attachments?: Array<{ filename: string; mimeType: string; url: string }> }) =>
      capturesApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captures.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to create capture: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useUpdateCaptureMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({
      captureId,
      ...data
    }: {
      captureId: string
      status: string
      triageResult?: { type: string; title: string; description: string; priority: number }
    }) => capturesApi.update(projectId, captureId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captures.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to update capture: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useDeleteCaptureMutation() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (captureId: string) =>
      capturesApi.delete(projectId, captureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.captures.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to delete capture: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────

export function filterCaptures(captures: Capture[], status?: 'pending' | 'deferred' | 'triaged' | 'dismissed'): Capture[] {
  if (!status) return captures.filter((c) => c.status !== 'dismissed')
  return captures.filter((c) => c.status === status)
}
