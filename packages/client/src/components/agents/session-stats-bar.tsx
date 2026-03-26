import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { isActiveSession } from '@/hooks/use-sessions'
import type { AgentSession } from '@/types'

interface SessionStatsBarProps {
  session: AgentSession
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m < 60) return `${m}m ${s}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

function LiveDuration({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])
  return <span className="font-mono tabular-nums">{formatDuration(now - startedAt)}</span>
}

export function SessionStatsBar({ session }: SessionStatsBarProps) {
  const isLive = isActiveSession(session)

  return (
    <div className="border-t border-edge bg-surface-raised">
      {/* Stats row */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[11px]">
        <span className="text-ink-muted">
          Duration:{' '}
          {isLive && session.startedAt ? (
            <LiveDuration startedAt={session.startedAt} />
          ) : session.startedAt && session.finishedAt ? (
            <span className="text-ink-secondary">
              {formatDuration(session.finishedAt - session.startedAt)}
            </span>
          ) : (
            <span className="text-ink-disabled">—</span>
          )}
        </span>
        <span className="text-ink-disabled">·</span>
        <span className="text-ink-muted">Model:</span>
        <Badge variant="default" className="text-[9px] px-1.5 py-0">{session.model}</Badge>

        {session.status !== 'queued' && (
          <>
            <span className="text-ink-disabled">·</span>
            <span className={cn(
              'text-[10px] font-medium',
              session.status === 'completed' ? 'text-success'
                : session.status === 'failed' ? 'text-error'
                : 'text-ink-muted',
            )}>
              {session.status}
            </span>
          </>
        )}

        {session.prUrl && (
          <>
            <span className="text-ink-disabled">·</span>
            <a
              href={session.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline text-[10px]"
            >
              PR
            </a>
          </>
        )}
      </div>
    </div>
  )
}
