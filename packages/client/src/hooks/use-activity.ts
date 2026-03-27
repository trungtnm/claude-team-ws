import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { activityApi } from '@/lib/resources'
import { useProject } from '@/providers/project-provider'

export function useActivityQuery(action?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.activity.list(projectId, action),
    queryFn: async () => {
      const { activity, total } = await activityApi.list(projectId, {
        action,
        limit: 50,
      })
      return { activity, total }
    },
    enabled: !!projectId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}
