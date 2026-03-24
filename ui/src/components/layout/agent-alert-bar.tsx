import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getWaitingSessions } from '@/data/sessions'

export function AgentAlertBar() {
  const navigate = useNavigate()
  const waitingSessions = getWaitingSessions()
  const [dismissed, setDismissed] = useState(false)

  if (waitingSessions.length === 0 || dismissed) {
    return null
  }

  if (waitingSessions.length === 1) {
    const session = waitingSessions[0]
    const questionText = session.question?.text ?? 'Needs input'
    const truncatedQuestion =
      questionText.length > 80
        ? `${questionText.slice(0, 80)}...`
        : questionText

    return (
      <div className="animate-pulse-warm mx-4 mt-2 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 p-3">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <span className="text-xs font-semibold tracking-wide text-amber-500">
            AGENT WAITING
          </span>
          <span className="text-sm font-medium text-ink">
            {session.agentName}
          </span>
          <span className="truncate text-sm text-ink-secondary">
            {truncatedQuestion}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            onClick={() => navigate(`/agents/${session.id}`)}
          >
            Answer
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="shrink-0 rounded-[var(--radius-sm)] p-1 text-ink-muted hover:text-ink hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-pulse-warm mx-4 mt-2 rounded-[var(--radius-md)] border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="text-xs font-semibold tracking-wide text-amber-500">
          AGENT WAITING
        </span>
        <span className="text-sm text-ink">
          {waitingSessions.length} agents need input
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto shrink-0"
          onClick={() => navigate('/agents')}
        >
          View All
        </Button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-ink-muted hover:text-ink hover:bg-surface-elevated transition-colors cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
