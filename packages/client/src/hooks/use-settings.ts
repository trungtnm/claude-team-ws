import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/query-keys'
import { projectsApi, reposApi, membersApi, rulesApi, webhooksApi } from '@/lib/resources'
import { useProject } from '@/providers/project-provider'
import type { Project, KnowledgeRule, WebhookConfig } from '@/types'

// ─── Project Settings ────────────────────────────────────────────────────────

export function useProjectSettings() {
  const { projectId } = useProject()

  const query = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => {
      const { project } = await projectsApi.get(projectId)
      return project
    },
    enabled: !!projectId,
  })

  return query
}

export function useUpdateProject() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: Partial<Pick<Project, 'name' | 'maxConcurrentAgents' | 'askQuestionMode' | 'worktreeMergeStrategy'>>) =>
      projectsApi.update(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() })
    },
    onError: (err) => {
      toast.error(`Failed to update project: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

// ─── Repos ───────────────────────────────────────────────────────────────────

export function useRepos() {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.repos.list(projectId),
    queryFn: async () => {
      const { repos } = await reposApi.list(projectId)
      return repos
    },
    enabled: !!projectId,
  })
}

export function useAddRepo() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: { name: string; gitUrl?: string; path?: string; defaultBranch?: string; linkMode?: 'clone' | 'symlink' }) => {
      if (data.linkMode === 'symlink' || (!data.gitUrl && data.path)) {
        return reposApi.link(projectId, {
          name: data.name,
          sourcePath: data.path!,
          defaultBranch: data.defaultBranch,
        })
      }
      return reposApi.clone(projectId, {
        name: data.name,
        gitUrl: data.gitUrl!,
        defaultBranch: data.defaultBranch,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to add repository: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function usePullRepo() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (repoName: string) => reposApi.pull(projectId, repoName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to pull repository: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useRemoveRepo() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (repoName: string) => reposApi.remove(projectId, repoName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.repos.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to remove repository: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

// ─── Members ─────────────────────────────────────────────────────────────────

export function useMembers() {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.members.list(projectId),
    queryFn: async () => {
      const { members } = await membersApi.list(projectId)
      return members
    },
    enabled: !!projectId,
  })
}

export function useAddMember() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: { userId: string; roleOverride?: string }) =>
      membersApi.add(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to add member: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useUpdateMemberRole() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ userId, roleOverride }: { userId: string; roleOverride: string | null }) =>
      membersApi.updateRole(projectId, userId, { roleOverride }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to update member role: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useRemoveMember() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (userId: string) => membersApi.remove(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.members.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to remove member: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export function useRules(filters?: { category?: string; maturity?: string }) {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.rules.list(projectId, filters),
    queryFn: async () => {
      const { rules } = await rulesApi.list(projectId, filters)
      return rules
    },
    enabled: !!projectId,
  })
}

export function useCreateRule() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: { ruleText: string; category: string; confidence?: number }) =>
      rulesApi.create(projectId, { ...data, confidence: data.confidence ?? 0.5 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to create rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useUpdateRule() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Partial<KnowledgeRule> }) =>
      rulesApi.update(projectId, ruleId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to update rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (ruleId: string) => rulesApi.delete(projectId, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rules.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to delete rule: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

// ─── Webhooks ────────────────────────────────────────────────────────────────

export function useWebhooks() {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.webhooks.list(projectId),
    queryFn: async () => {
      const { webhooks } = await webhooksApi.list(projectId)
      return webhooks
    },
    enabled: !!projectId,
  })
}

export function useCreateWebhook() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (data: { type: string; url: string; events: string[] }) =>
      webhooksApi.create(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to create webhook: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useUpdateWebhook() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: ({ webhookId, data }: { webhookId: string; data: Partial<Pick<WebhookConfig, 'url' | 'events' | 'enabled'>> }) =>
      webhooksApi.update(projectId, webhookId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to update webhook: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useDeleteWebhook() {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (webhookId: string) => webhooksApi.delete(projectId, webhookId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(projectId) })
    },
    onError: (err) => {
      toast.error(`Failed to delete webhook: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useSendTestWebhook() {
  const { projectId } = useProject()

  return useMutation({
    mutationFn: (webhookId: string) => webhooksApi.sendTest(projectId, webhookId),
    onSuccess: () => {
      toast.success('Test notification sent successfully')
    },
    onError: (err) => {
      toast.error(`Test failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}
