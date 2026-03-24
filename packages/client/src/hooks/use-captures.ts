import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useParams } from 'react-router-dom'

export interface Capture {
  id: string
  project_id: string
  user_id: string
  text: string
  status: 'pending' | 'triaged' | 'deferred' | 'dismissed'
  triage_result: string | null
  created_at: number
  triaged_at: number | null
  triaged_by: string | null
  user?: { id: string; name: string; avatar_url: string | null }
}

interface CapturesResponse {
  captures: Capture[]
}

interface CaptureResponse {
  capture: Capture
}

export function useCaptures(statusFilter?: string) {
  const { projectId } = useParams<{ projectId: string }>()

  return useQuery<Capture[]>({
    queryKey: ['captures', projectId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const path = `/projects/${projectId}/captures${params.toString() ? `?${params}` : ''}`
      const res = await api.get<CapturesResponse>(path)
      return res.captures
    },
    enabled: !!projectId,
  })
}

export function useCreateCapture() {
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()

  return useMutation({
    mutationFn: async (text: string) => {
      const res = await api.post<CaptureResponse>(`/projects/${projectId}/captures`, { text })
      return res.capture
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
    },
  })
}

export function useTriageCapture() {
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()

  return useMutation({
    mutationFn: async ({ captureId, triageResult }: { captureId: string; triageResult: unknown }) => {
      const res = await api.patch<CaptureResponse>(`/projects/${projectId}/captures/${captureId}`, {
        status: 'triaged',
        triage_result: triageResult,
      })
      return res.capture
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
      queryClient.invalidateQueries({ queryKey: ['epics', projectId] })
    },
  })
}

export function useUpdateCaptureStatus() {
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()

  return useMutation({
    mutationFn: async ({ captureId, status }: { captureId: string; status: string }) => {
      const res = await api.patch<CaptureResponse>(`/projects/${projectId}/captures/${captureId}`, { status })
      return res.capture
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
    },
  })
}

export function useDismissCapture() {
  const queryClient = useQueryClient()
  const { projectId } = useParams<{ projectId: string }>()

  return useMutation({
    mutationFn: async (captureId: string) => {
      await api.delete(`/projects/${projectId}/captures/${captureId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
    },
  })
}
