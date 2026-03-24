import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, X, LinkIcon, ArrowRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AgentStreamView } from '@/components/agents/agent-stream-view'
import { SessionStatsBar } from '@/components/agents/session-stats-bar'
import { AskQuestionDialog } from '@/components/agents/ask-question-dialog'
import { sessions } from '@/data/sessions'
import { toast } from 'sonner'

const statusVariantMap: Record<string, 'success' | 'warning' | 'default' | 'error'> = {
  running: 'success',
  waiting_input: 'warning',
  queued: 'default',
  completed: 'success',
  failed: 'error',
}

const statusLabelMap: Record<string, string> = {
  running: 'Running',
  waiting_input: 'Waiting Input',
  queued: 'Queued',
  completed: 'Completed',
  failed: 'Failed',
}

export default function AgentStreamPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const session = sessions.find((s) => s.id === sessionId)
  const [questionOpen, setQuestionOpen] = useState(session?.status === 'waiting_input')

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

  return (
    <div className="flex h-full flex-col">
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
            <span className="text-sm font-medium text-ink">{session.agentName || 'Unassigned'}</span>
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

        {/* Epic / Bead context */}
        <div className="mt-2 ml-[72px] space-y-0.5">
          <Link
            to={`/board?epic=${session.epicId}`}
            className="flex items-center gap-1.5 text-xs text-ink-secondary hover:text-accent transition-colors"
          >
            <LinkIcon className="h-3 w-3 shrink-0" />
            <span>Epic: {session.epicTitle}</span>
          </Link>
          {session.beadTitle && (
            <div className="flex items-center gap-1.5 pl-[18px] text-xs text-ink-muted">
              <ArrowRight className="h-2.5 w-2.5 shrink-0" />
              <span>Bead: {session.beadTitle}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stream */}
      <AgentStreamView sessionId={session.id} />

      {/* Stats bar */}
      <SessionStatsBar session={session} />

      {/* Question dialog */}
      {session.question && session.status === 'waiting_input' && (
        <AskQuestionDialog
          session={session}
          open={questionOpen}
          onOpenChange={setQuestionOpen}
        />
      )}
    </div>
  )
}
