import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { notificationsApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'

export function useNotifications(params?: { read?: boolean; limit?: number }) {
  return useQuery({
    queryKey: queryKeys.notifications.list(params),
    queryFn: async () => {
      const { notifications } = await notificationsApi.list(params)
      return notifications
    },
  })
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (notificationId: string) => notificationsApi.markRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
    onError: (err) => {
      toast.error(`Failed to mark notification as read: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
    onError: (err) => {
      toast.error(`Failed to mark all as read: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })
}
