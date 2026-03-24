import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

// ── Types ────────────────────────────────────────────────────────────────────

interface PrFile {
  path: string
  additions: number
  deletions: number
  patch: string
}

interface PrComment {
  id: number
  user: string
  body: string
  path?: string
  line?: number
  created_at: string
}

interface ReviewDetail {
  pr: {
    url: string
    number: number
    title: string
    state: string
    branch: string
    additions: number
    deletions: number
  }
  diff: { files: PrFile[] }
  human_comments: PrComment[]
  session: {
    id: string
    epic_id: string | null
    pr_status: string | null
  }
}

interface ReviewListItem {
  session_id: string
  epic_id: string | null
  pr_url: string | null
  pr_status: string | null
  model: string
  created_at: number
  finished_at: number | null
}

// ── Keys ─────────────────────────────────────────────────────────────────────

export const reviewKeys = {
  all: ['reviews'] as const,
  list: (projectId: string) => ['reviews', 'list', projectId] as const,
  detail: (sessionId: string) => ['reviews', 'detail', sessionId] as const,
}

// ── Queries ──────────────────────────────────────────────────────────────────

export function useReviewsQuery(projectId: string) {
  return useQuery({
    queryKey: reviewKeys.list(projectId),
    queryFn: () => api.get<{ reviews: ReviewListItem[] }>(`/projects/${projectId}/reviews`),
    enabled: !!projectId,
  })
}

export function useReviewDetailQuery(projectId: string, sessionId: string) {
  return useQuery({
    queryKey: reviewKeys.detail(sessionId),
    queryFn: () => api.get<ReviewDetail>(`/projects/${projectId}/reviews/${sessionId}`),
    enabled: !!sessionId && !!projectId,
  })
}

// ── Mutations ────────────────────────────────────────────────────────────────

export function useAddCommentMutation(projectId: string, sessionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: { file?: string; line?: number; body: string }) =>
      api.post(`/projects/${projectId}/reviews/${sessionId}/comment`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.detail(sessionId) })
      toast.success('Comment added')
    },
    onError: (err) => {
      toast.error(`Failed to add comment: ${err.message}`)
    },
  })
}

export function useMergePrMutation(projectId: string, sessionId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (strategy: 'squash' | 'merge' | 'rebase') =>
      api.post(`/projects/${projectId}/reviews/${sessionId}/merge`, { strategy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: reviewKeys.list(projectId) })
      toast.success('PR merged successfully')
    },
    onError: (err) => {
      toast.error(`Failed to merge: ${err.message}`)
    },
  })
}
