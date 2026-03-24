import { useState } from 'react'
import {
  Terminal,
  MessageSquare,
  Wrench,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import type { StreamEvent as StreamEventType } from '@/data/agent-stream'

interface StreamEventProps {
  event: StreamEventType
}

export function StreamEvent({ event }: StreamEventProps) {
  const [expanded, setExpanded] = useState(false)

  if (event.type === 'system') {
    return (
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] bg-surface-elevated px-3 py-2">
        <Terminal className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" />
        <span className="font-mono text-xs text-ink-muted">{event.content}</span>
      </div>
    )
  }

  if (event.type === 'assistant') {
    return (
      <div className="flex items-start gap-2 pl-1">
        <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-secondary" />
        <p className="text-sm text-ink">{event.content}</p>
      </div>
    )
  }

  if (event.type === 'tool_use') {
    return (
      <div className="rounded-[var(--radius-md)] border border-edge bg-surface-elevated/50">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          )}
          <Wrench className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="text-xs font-medium text-ink-secondary">{event.toolName}</span>
          {event.toolInput && (
            <span className="truncate text-xs text-ink-muted">{event.toolInput}</span>
          )}
        </button>
        {expanded && event.toolResult && (
          <div className="border-t border-edge px-3 py-2">
            <pre className="whitespace-pre-wrap font-mono text-xs text-ink-muted">
              {event.toolResult}
            </pre>
          </div>
        )}
      </div>
    )
  }

  if (event.type === 'tool_result') {
    return (
      <div className="rounded-[var(--radius-md)] border border-edge bg-surface-elevated/50 px-3 py-2">
        <pre className="whitespace-pre-wrap font-mono text-xs text-ink-muted">
          {event.content}
        </pre>
      </div>
    )
  }

  if (event.type === 'result') {
    return (
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-success/20 bg-success/10 px-3 py-2">
        <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        <span className="text-sm text-ink">{event.content}</span>
      </div>
    )
  }

  if (event.type === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-error/20 bg-error/10 px-3 py-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" />
        <span className="text-sm text-ink">{event.content}</span>
      </div>
    )
  }

  return null
}
