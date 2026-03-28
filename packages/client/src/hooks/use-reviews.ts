import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { reviewsApi } from '@/lib/resources'
import { useProject } from '@/providers/project-provider'
import { transformGitHubFiles, parsePrDiff } from '@/lib/diff-parser'
import type {
  PrReviewData,
  PrReviewAiData,
  PrComment,
  PrFile,
  AgentSession,
} from '@/types'

// ─── Transform API response → component shape ───────────────────────────────

interface GitHubPrData {
  number?: number
  title?: string
  headRefName?: string
  baseRefName?: string
  state?: string
  files?: Array<{
    filename: string
    additions: number
    deletions: number
    patch?: string
  }>
  comments?: Array<{
    author?: { login?: string }
    body?: string
    createdAt?: string
  }>
  reviews?: Array<{
    author?: { login?: string }
    state?: string
    body?: string
    submittedAt?: string
  }>
}

function getInitials(name: string): string {
  if (!name) return '??'
  return name.split(/[\s_-]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
}

function transformComments(pr: GitHubPrData): PrComment[] {
  const comments: PrComment[] = []

  // PR-level comments
  if (pr.comments) {
    for (const c of pr.comments) {
      const author = c.author?.login ?? 'Unknown'
      comments.push({
        id: `gh-comment-${comments.length}`,
        author,
        authorInitials: getInitials(author),
        text: c.body ?? '',
        createdAt: c.createdAt ? Math.floor(new Date(c.createdAt).getTime() / 1000) : 0,
      })
    }
  }

  // Review comments (from review submissions)
  if (pr.reviews) {
    for (const r of pr.reviews) {
      if (!r.body) continue // Skip reviews without body text
      const author = r.author?.login ?? 'Unknown'
      comments.push({
        id: `gh-review-${comments.length}`,
        author,
        authorInitials: getInitials(author),
        text: r.body,
        createdAt: r.submittedAt ? Math.floor(new Date(r.submittedAt).getTime() / 1000) : 0,
      })
    }
  }

  return comments.sort((a, b) => a.createdAt - b.createdAt)
}

function transformFiles(pr: GitHubPrData, rawDiff: string | null): PrFile[] {
  // Prefer per-file patches from GitHub files array
  if (pr.files && pr.files.length > 0) {
    return transformGitHubFiles(pr.files)
  }
  // Fallback: parse the raw diff string
  if (rawDiff) {
    return parsePrDiff(rawDiff)
  }
  return []
}

const defaultAiReview: Readonly<PrReviewAiData> = Object.freeze({
  ubsPass: true,
  ubsIssues: 0,
  securityWarnings: [],
  standardsPass: true,
  verdict: 'Pending Review',
})

function transformApiResponse(
  session: AgentSession,
  pr: GitHubPrData | null,
  rawDiff: string | null,
): PrReviewData {
  const prNumber = pr?.number ?? extractPrNumber(session.prUrl ?? '')
  const title = pr?.title ?? session.prompt ?? 'PR Review'
  const branch = pr?.headRefName ?? ''
  const baseBranch = pr?.baseRefName ?? 'main'

  return {
    sessionId: session.id,
    prNumber,
    title,
    branch,
    baseBranch,
    epicTitle: session.epic?.title ?? 'Unknown Epic',
    agentName: session.agentMailName ?? `Agent-${session.id.slice(0, 6)}`,
    files: pr ? transformFiles(pr, rawDiff) : rawDiff ? parsePrDiff(rawDiff) : [],
    aiReview: { ...defaultAiReview, securityWarnings: [] },
    comments: pr ? transformComments(pr) : [],
  }
}

function extractPrNumber(prUrl: string): number {
  const match = prUrl.match(/\/pull\/(\d+)/)
  return match ? parseInt(match[1], 10) : 0
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useReviewList() {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.reviews.list(projectId),
    queryFn: async () => {
      const { reviews } = await reviewsApi.list(projectId)
      return reviews
    },
    enabled: !!projectId,
  })
}

export function useReview(sessionId: string) {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.reviews.detail(sessionId),
    queryFn: async () => {
      const data = await reviewsApi.get(projectId, sessionId)
      const { session, pr, diff } = data.review
      return transformApiResponse(
        session,
        pr as GitHubPrData | null,
        diff as string | null,
      )
    },
    enabled: !!projectId && !!sessionId,
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ sessionId, body }: { sessionId: string; body: string }) =>
      reviewsApi.comment(projectId, sessionId, { body }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.detail(variables.sessionId),
      })
    },
    onError: (err) => {
      toast.error(`Failed to add comment: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useMergePr() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ sessionId, strategy }: { sessionId: string; strategy: 'squash' | 'merge' | 'rebase' }) =>
      reviewsApi.merge(projectId, sessionId, { strategy }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.detail(variables.sessionId),
      })
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.all(projectId),
      })
    },
    onError: (err) => {
      toast.error(`Failed to merge PR: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}
