import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentStreamView } from '@/components/agents/agent-stream-view'
import { SessionStatsBar } from '@/components/agents/session-stats-bar'
import { SessionInput } from '@/components/agents/session-input'
import { PermissionModeBar } from '@/components/agents/permission-mode-bar'
import { sessions } from '@/data/sessions'
import { toast } from 'sonner'

const statusVariantMap: Record<string, 'success' | 'warning' | 'default' | 'error' | 'info'> = {
  running: 'success',
  idle: 'info',
  waiting_input: 'warning',
  completed: 'success',
  failed: 'error',
}

const statusLabelMap: Record<string, string> = {
  running: 'Running',
  idle: 'Idle',
  waiting_input: 'Waiting Input',
  completed: 'Completed',
  failed: 'Failed',
}

export default function AgentStreamPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const session = sessions.find((s) => s.id === sessionId)

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
    toast.info('Session cancellation not available in demo')
  }

  const isActive = session.status === 'running' || session.status === 'waiting_input' || session.status === 'idle'

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
            <span className="text-sm font-medium text-ink">{session.name}</span>
            <Badge variant={statusVariantMap[session.status] ?? 'default'}>
              {statusLabelMap[session.status] ?? session.status}
            </Badge>
          </div>
          {(session.status === 'running' || session.status === 'waiting_input') && (
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:text-error"
              onClick={handleCancel}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>

        {/* Permission mode bar */}
        {isActive && (
          <div className="mt-2 ml-[72px]">
            <PermissionModeBar sessionId={session.id} currentMode={session.permissionMode} />
          </div>
        )}
      </div>

      {/* Stream */}
      <div className="flex-1 min-h-0">
        <AgentStreamView sessionId={session.id} />
      </div>

      {/* Stats bar + input */}
      <div className="shrink-0">
        <SessionStatsBar session={session} />
        <SessionInput
          session={session}
          onCancel={handleCancel}
        />
      </div>
    </div>
  )
}
