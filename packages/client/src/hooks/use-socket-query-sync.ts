import { useQueryClient } from '@tanstack/react-query'
import { useSocketEvent } from './use-socket-event'
import { queryKeys } from '@/lib/query-keys'
import { useProject } from '@/providers/project-provider'
import { toCamelCase } from '@/lib/case-convert'
import type {
  CaptureCreatedEvent,
  EpicCreatedEvent,
  EpicUpdatedEvent,
  SessionLifecycleEvent,
  SessionEventData,
  NotificationEvent,
  PrEventData,
  BeadsChangedEvent,
} from '@/types/socket-events'

export function useSocketQuerySync(): void {
  const queryClient = useQueryClient()
  const { projectId } = useProject()

  // capture:created → invalidate captures list
  useSocketEvent<CaptureCreatedEvent>('capture:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.captures.all(projectId),
    })
  })

  // epic:created → invalidate epics list
  useSocketEvent<EpicCreatedEvent>('epic:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.epics.all(projectId),
    })
  })

  // epic:updated → invalidate epics list + specific detail
  useSocketEvent<EpicUpdatedEvent>('epic:updated', (data) => {
    const event = toCamelCase<{ epic: { id: string } }>(data)
    queryClient.invalidateQueries({
      queryKey: queryKeys.epics.all(projectId),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.epics.detail(projectId, event.epic.id),
    })
  })

  // session:lifecycle → invalidate sessions list + detail
  useSocketEvent<SessionLifecycleEvent>('session:lifecycle', (data) => {
    const event = toCamelCase<{ session: { id: string; epicId: string | null } }>(data)
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.all(projectId),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.detail(event.session.id),
    })
    // Also invalidate the epic if session is linked to one
    if (event.session.epicId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.detail(projectId, event.session.epicId),
      })
    }
  })

  // session:event → invalidate session events
  useSocketEvent<SessionEventData>('session:event', (data) => {
    const event = toCamelCase<{ sessionId: string }>(data)
    queryClient.invalidateQueries({
      queryKey: queryKeys.sessions.events(event.sessionId),
    })
  })

  // pr:event → invalidate reviews
  useSocketEvent<PrEventData>('pr:event', (data) => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.reviews.all(projectId),
    })
    // Also invalidate the specific review detail if sessionId is available
    const event = toCamelCase<{ sessionId?: string }>(data)
    if (event.sessionId) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.reviews.detail(event.sessionId),
      })
    }
  })

  // notification → invalidate notifications
  useSocketEvent<NotificationEvent>('notification', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.notifications.all,
    })
  })

  // ─── Settings Events ──────────────────────────────────────────────────────

  // project:updated → invalidate project detail + list
  useSocketEvent('project:updated', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.projects.detail(projectId),
    })
    queryClient.invalidateQueries({
      queryKey: queryKeys.projects.list(),
    })
  })

  // repo:created / repo:updated / repo:removed → invalidate repos
  useSocketEvent('repo:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.repos.all(projectId),
    })
  })
  useSocketEvent('repo:updated', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.repos.all(projectId),
    })
  })
  useSocketEvent('repo:removed', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.repos.all(projectId),
    })
  })

  // member:added / member:updated / member:removed → invalidate members
  useSocketEvent('member:added', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.members.all(projectId),
    })
  })
  useSocketEvent('member:updated', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.members.all(projectId),
    })
  })
  useSocketEvent('member:removed', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.members.all(projectId),
    })
  })

  // rule:created / rule:updated / rule:deleted → invalidate rules
  useSocketEvent('rule:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.rules.all(projectId),
    })
  })
  useSocketEvent('rule:updated', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.rules.all(projectId),
    })
  })
  useSocketEvent('rule:deleted', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.rules.all(projectId),
    })
  })

  // webhook:created / webhook:updated / webhook:deleted → invalidate webhooks
  useSocketEvent('webhook:created', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhooks.all(projectId),
    })
  })
  useSocketEvent('webhook:updated', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhooks.all(projectId),
    })
  })
  useSocketEvent('webhook:deleted', () => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhooks.all(projectId),
    })
  })

  // beads:changed → invalidate epics + graph
  useSocketEvent<BeadsChangedEvent>('beads:changed', (data) => {
    const event = toCamelCase<{ hint: string }>(data)
    if (event.hint === 'refetch_board') {
      queryClient.invalidateQueries({
        queryKey: queryKeys.epics.all(projectId),
      })
    }
    if (event.hint === 'refetch_graph') {
      queryClient.invalidateQueries({
        queryKey: queryKeys.graph.data(projectId),
      })
    }
  })
}
