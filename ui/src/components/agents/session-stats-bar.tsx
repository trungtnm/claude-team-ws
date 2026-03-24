import { Badge } from '@/components/ui/badge'
import type { AgentSession } from '@/data/sessions'

interface SessionStatsBarProps {
  session: AgentSession
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

export function SessionStatsBar({ session }: SessionStatsBarProps) {
  return (
    <div className="flex items-center gap-4 border-t border-edge bg-surface-raised px-4 py-2">
      <span className="text-xs text-ink-muted">
        Turns: <span className="text-ink-secondary">{session.turns}</span>
      </span>
      <span className="text-xs text-ink-disabled">|</span>
      <span className="text-xs text-ink-muted">
        Files: <span className="text-ink-secondary">{session.filesModified}</span>
      </span>
      <span className="text-xs text-ink-disabled">|</span>
      <span className="text-xs text-ink-muted">
        Duration: <span className="text-ink-secondary">{formatDuration(session.duration)}</span>
      </span>
      <span className="text-xs text-ink-disabled">|</span>
      <span className="text-xs text-ink-muted">Model:</span>
      <Badge variant="default" className="text-[10px]">{session.model}</Badge>
    </div>
  )
}
