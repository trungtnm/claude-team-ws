import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { isActiveSession } from '@/hooks/use-sessions'
import { useSessionStats } from '@/hooks/use-session-stats'
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

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 100_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
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
  const stats = useSessionStats(session.id, session.model)

  return (
    <div className="border-t border-edge bg-surface-raised">
      {/* Context window gauge */}
      {stats.contextPercentage > 0 && (
        <div className="px-4 pt-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  stats.contextPercentage > 80 ? 'bg-red-400'
                    : stats.contextPercentage > 60 ? 'bg-amber-400'
                    : 'bg-accent/60',
                )}
                style={{ width: `${Math.min(stats.contextPercentage, 100)}%` }}
              />
            </div>
            <span className={cn(
              'text-[10px] font-mono tabular-nums',
              stats.contextPercentage > 80 ? 'text-red-400'
                : stats.contextPercentage > 60 ? 'text-amber-400'
                : 'text-ink-disabled',
            )}>
              {stats.contextPercentage}%
            </span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[11px]">
        <span className="text-ink-muted">
          Turns: <span className="text-ink-secondary">{stats.turns}</span>
        </span>
        <span className="text-ink-disabled">·</span>
        <span className="text-ink-muted">
          Files: <span className="text-ink-secondary">{stats.filesModified}</span>
        </span>
        <span className="text-ink-disabled">·</span>
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

        {stats.tokensUsed > 0 && (
          <>
            <span className="text-ink-disabled">·</span>
            <span className="text-ink-muted">{formatTokens(stats.tokensUsed)} tokens</span>
          </>
        )}

        {stats.costUsd > 0.001 && (
          <>
            <span className="text-ink-disabled">·</span>
            <span className="text-accent font-medium">${stats.costUsd.toFixed(2)}</span>
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
