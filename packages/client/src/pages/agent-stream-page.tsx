import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, X, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentStreamView } from '@/components/agents/agent-stream-view'
import { SessionStatsBar } from '@/components/agents/session-stats-bar'
import { SessionInput } from '@/components/agents/session-input'
import { PermissionModeBar } from '@/components/agents/permission-mode-bar'
import { useSessionQuery, useCancelSessionMutation, useSessionRoom, isActiveSession } from '@/hooks/use-sessions'

const statusVariantMap: Record<string, 'success' | 'warning' | 'default' | 'error' | 'info'> = {
  running: 'success',
  idle: 'info',
  queued: 'info',
  waiting_input: 'warning',
  completed: 'success',
  failed: 'error',
  cancelled: 'default',
}

const statusLabelMap: Record<string, string> = {
  running: 'Running',
  idle: 'Idle',
  queued: 'Queued',
  waiting_input: 'Waiting Input',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

export default function AgentStreamPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { data: session, isLoading } = useSessionQuery(sessionId)
  const cancelMutation = useCancelSessionMutation()

  // Join the session's Socket.IO room for real-time events
  useSessionRoom(sessionId)

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-ink">Session not found</p>
          <p className="mt-1 text-sm text-ink-muted">The session you are looking for does not exist.</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to="/agents">Back to Agents</Link>
          </Button>
        </div>
      </div>
    )
  }

  const handleCancel = () => {
    cancelMutation.mutate(session.id)
  }

  const active = isActiveSession(session)

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/agents">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="h-4 w-px bg-edge" />
            <span className="text-sm font-medium text-ink truncate max-w-md">{session.prompt}</span>
            <Badge variant={statusVariantMap[session.status] ?? 'default'}>
              {statusLabelMap[session.status] ?? session.status}
            </Badge>
          </div>
          {(session.status === 'running' || session.status === 'waiting_input') && (
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:text-error"
              disabled={cancelMutation.isPending}
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

      </div>

      {/* Stream */}
      <div className="flex-1 min-h-0">
        <AgentStreamView sessionId={session.id} />
      </div>

      {/* Permission mode bar + Stats bar + input */}
      <div className="shrink-0">
        <SessionStatsBar session={session} />
        {active && (
          <div className="px-4 py-1.5 border-t border-edge">
            <PermissionModeBar sessionId={session.id} currentMode="default" />
          </div>
        )}
        <SessionInput
          session={session}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}
