import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { activityApi } from '@/lib/resources'
import { useProject } from '@/providers/project-provider'
export function useMetricsQuery() {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.activity.metrics(projectId),
    queryFn: () => activityApi.metrics(projectId),
    enabled: !!projectId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
}
