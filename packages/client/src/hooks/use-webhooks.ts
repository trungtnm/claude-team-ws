import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

interface WebhookConfig {
  id: string
  project_id: string
  type: 'slack' | 'discord'
  url: string
  events: string[]
  enabled: number
  created_at: number
}

export const webhookKeys = {
  all: ['webhooks'] as const,
  list: (projectId: string) => ['webhooks', 'list', projectId] as const,
}

export function useWebhooksQuery(projectId: string) {
  return useQuery({
    queryKey: webhookKeys.list(projectId),
    queryFn: () => api.get<{ webhooks: WebhookConfig[] }>(`/projects/${projectId}/webhooks`),
    enabled: !!projectId,
  })
}

export function useCreateWebhookMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { type: 'slack' | 'discord'; url: string; events?: string[] }) =>
      api.post(`/projects/${projectId}/webhooks`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) })
      toast.success('Webhook created')
    },
    onError: (err) => toast.error(`Failed to create webhook: ${err.message}`),
  })
}

export function useDeleteWebhookMutation(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (webhookId: string) =>
      api.delete(`/projects/${projectId}/webhooks/${webhookId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.list(projectId) })
      toast.success('Webhook deleted')
    },
    onError: (err) => toast.error(`Failed to delete webhook: ${err.message}`),
  })
}
