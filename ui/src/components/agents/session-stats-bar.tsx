import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { AgentSession } from '@/data/sessions'

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
  const isLive = session.status === 'running' || session.status === 'waiting_input' || session.status === 'idle'
  const ctx = session.contextWindow

  return (
    <div className="border-t border-edge bg-surface-raised">
      {/* Context window bar */}
      {ctx && ctx.usedPercentage > 0 && (
        <div className="px-4 pt-1.5">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1 rounded-full bg-surface-elevated overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  ctx.usedPercentage > 80 ? 'bg-red-400'
                    : ctx.usedPercentage > 60 ? 'bg-amber-400'
                    : 'bg-accent/60',
                )}
                style={{ width: `${Math.min(ctx.usedPercentage, 100)}%` }}
              />
            </div>
            <span className={cn(
              'text-[10px] font-mono tabular-nums',
              ctx.usedPercentage > 80 ? 'text-red-400'
                : ctx.usedPercentage > 60 ? 'text-amber-400'
                : 'text-ink-disabled',
            )}>
              {ctx.usedPercentage}%
            </span>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[11px]">
        <span className="text-ink-muted">
          Turns: <span className="text-ink-secondary">{session.turns}</span>
        </span>
        <span className="text-ink-disabled">·</span>
        <span className="text-ink-muted">
          Files: <span className="text-ink-secondary">{session.filesModified}</span>
        </span>
        <span className="text-ink-disabled">·</span>
        <span className="text-ink-muted">
          Duration:{' '}
          {isLive ? (
            <LiveDuration startedAt={session.startedAt} />
          ) : (
            <span className="text-ink-secondary">
              {formatDuration(session.duration)}
            </span>
          )}
        </span>
        <span className="text-ink-disabled">·</span>
        <span className="text-ink-muted">Model:</span>
        <Badge variant="default" className="text-[9px] px-1.5 py-0">{session.model}</Badge>

        {/* Token counts */}
        {session.tokensUsed !== undefined && session.tokensUsed > 0 && (
          <>
            <span className="text-ink-disabled">·</span>
            <span className="text-ink-muted">
              {formatTokens(session.tokensUsed)} tokens
            </span>
          </>
        )}

        {/* Cost */}
        {session.costUsd !== undefined && session.costUsd > 0 && (
          <>
            <span className="text-ink-disabled">·</span>
            <span className="text-accent font-medium">${session.costUsd.toFixed(2)}</span>
          </>
        )}

        {/* Context window detail (right-aligned) */}
        {ctx && ctx.currentUsage && (
          <span className="ml-auto text-[10px] text-ink-disabled font-mono">
            ctx: {formatTokens(ctx.currentUsage.inputTokens + ctx.currentUsage.cacheCreationInputTokens + ctx.currentUsage.cacheReadInputTokens)}
            {ctx.currentUsage.cacheReadInputTokens > 0 && (
              <span className="text-success"> ({formatTokens(ctx.currentUsage.cacheReadInputTokens)} cached)</span>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
