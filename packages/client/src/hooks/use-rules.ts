import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface KnowledgeRule {
  id: string
  project_id: string
  rule_text: string
  category: string
  confidence: number
  maturity: string
  source: string
  helpful_count: number
  harmful_count: number
  created_at: number
  updated_at: number
}

export const ruleKeys = {
  all: ['rules'] as const,
  list: (projectId: string) => ['rules', 'list', projectId] as const,
}

export function useRulesQuery(projectId: string) {
  return useQuery({
    queryKey: ruleKeys.list(projectId),
    queryFn: () => api.get<{ rules: KnowledgeRule[] }>(`/projects/${projectId}/rules`),
    enabled: !!projectId,
  })
}

export function useCreateRuleMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { rule_text: string; category?: string }) =>
      api.post(`/projects/${projectId}/rules`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ruleKeys.list(projectId) })
      toast.success('Rule created')
    },
    onError: (err) => toast.error(`Failed to create rule: ${err.message}`),
  })
}

export function useUpdateRuleMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, ...data }: { ruleId: string; rule_text?: string; category?: string; maturity?: string }) =>
      api.patch(`/projects/${projectId}/rules/${ruleId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ruleKeys.list(projectId) })
      toast.success('Rule updated')
    },
    onError: (err) => toast.error(`Failed to update rule: ${err.message}`),
  })
}

export function useDeleteRuleMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) =>
      api.delete(`/projects/${projectId}/rules/${ruleId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ruleKeys.list(projectId) })
      toast.success('Rule deleted')
    },
    onError: (err) => toast.error(`Failed to delete rule: ${err.message}`),
  })
}
