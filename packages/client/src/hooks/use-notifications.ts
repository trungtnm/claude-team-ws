import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useSocketEvent } from '@/hooks/use-socket'

interface Notification {
  id: string
  user_id: string
  project_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read: number
  created_at: number
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => ['notifications', 'list'] as const,
}

export function useNotificationsQuery() {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: () => api.get<{ notifications: Notification[]; unread_count: number }>('/notifications'),
    refetchInterval: 30000,
  })
}

export function useMarkReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) =>
      api.post(`/notifications/${notificationId}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useMarkAllReadMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all })
    },
  })
}

export function useNotificationSocket() {
  const queryClient = useQueryClient()

  useSocketEvent('notification', () => {
    queryClient.invalidateQueries({ queryKey: notificationKeys.all })
  })
}
