import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, X, Loader2, Terminal, MessageSquare, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSessionQuery, useCancelSessionMutation, useAnswerSessionMutation, type SessionSummary } from '@/hooks/use-sessions'
import { useSocketRoom, useSocketEvent } from '@/hooks/use-socket'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface StreamEvent {
  type: string
  content?: string
  text?: string
  toolName?: string
  tool_name?: string
  [key: string]: unknown
}

const statusVariantMap: Record<string, 'success' | 'warning' | 'default' | 'error' | 'info'> = {
  queued: 'default',
  running: 'success',
  waiting_input: 'warning',
  completed: 'success',
  failed: 'error',
  validation_failed: 'error',
  cancelled: 'default',
  detached: 'info',
}

const statusLabelMap: Record<string, string> = {
  queued: 'Queued',
  running: 'Running',
  waiting_input: 'Waiting Input',
  completed: 'Completed',
  validation_failed: 'Validation Failed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  detached: 'Detached',
}

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_input'])

export default function AgentStreamPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>()
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [answer, setAnswer] = useState('')
  const streamEndRef = useRef<HTMLDivElement>(null)

  // Join session room for real-time events
  useSocketRoom(sessionId ? `session:${sessionId}` : undefined)

  const { data: session, isLoading } = useSessionQuery(projectId!, sessionId)
  const cancelSession = useCancelSessionMutation(projectId!)
  const answerSession = useAnswerSessionMutation(projectId!)

  // Listen for streaming events
  useSocketEvent<{ sessionId: string; event: StreamEvent }>('session:event', (data) => {
    if (data.sessionId === sessionId) {
      setEvents((prev) => {
        const next = [...prev, data.event]
        return next.length > 2000 ? next.slice(-2000) : next
      })
    }
  })

  // Auto-scroll to bottom
  useEffect(() => {
    streamEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="relative h-6 w-6">
          <div className="absolute inset-0 rounded-full border-2 border-edge" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-ink">Session not found</p>
          <Button variant="outline" size="sm" className="mt-4" asChild>
            <Link to={`/projects/${projectId}/agents`}>Back to Agents</Link>
          </Button>
        </div>
      </div>
    )
  }

  const isActive = ACTIVE_STATUSES.has(session.status)
  const isWaiting = session.status === 'waiting_input'

  function handleAnswer(e: React.FormEvent) {
    e.preventDefault()
    if (!answer.trim() || !sessionId) return
    answerSession.mutate(
      { sessionId, answer: answer.trim() },
      {
        onSuccess: () => {
          setAnswer('')
          toast.success('Answer sent')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/projects/${projectId}/agents`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="h-4 w-px bg-edge" />
            <span className="text-sm font-medium text-ink">
              {session.agent_mail_name ?? sessionId?.slice(0, 8)}
            </span>
            <Badge variant={statusVariantMap[session.status] ?? 'default'}>
              {statusLabelMap[session.status] ?? session.status}
            </Badge>
            <Badge variant="outline" className="text-[10px]">{session.model}</Badge>
          </div>
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="text-error hover:text-error"
              onClick={() => {
                cancelSession.mutate(sessionId!, {
                  onSuccess: () => toast.success('Session cancelled'),
                  onError: (err) => toast.error(err.message),
                })
              }}
            >
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      {/* Stream view */}
      <ScrollArea className="flex-1 bg-surface-base">
        <div className="p-4 space-y-0.5 font-mono text-xs leading-relaxed">
          {events.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Terminal className="h-8 w-8 text-ink-disabled mb-3" />
              <p className="text-sm text-ink-muted">
                {isActive ? 'Waiting for stream events...' : 'No events recorded'}
              </p>
              {isActive && (
                <Loader2 className="h-4 w-4 animate-spin text-ink-disabled mt-2" />
              )}
            </div>
          ) : (
            events.map((event, i) => (
              <StreamEventRow key={i} event={event} />
            ))
          )}
          <div ref={streamEndRef} />
        </div>
      </ScrollArea>

      {/* Q&A input bar (when waiting for input) */}
      {isWaiting && (
        <div className="border-t border-warning/30 bg-warning/5 px-4 py-3 animate-pulse-warm">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-4 w-4 text-warning" />
            <span className="text-sm font-medium text-warning">Agent needs your input</span>
          </div>
          <form onSubmit={handleAnswer} className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Type your answer..."
              className="flex-1"
              autoFocus
            />
            <Button type="submit" size="sm" disabled={!answer.trim() || answerSession.isPending}>
              <Send className="h-3.5 w-3.5" />
              Send
            </Button>
          </form>
        </div>
      )}

      {/* Prompt preview at bottom */}
      <div className="border-t border-edge px-4 py-2 bg-surface-raised">
        <p className="text-[10px] text-ink-disabled truncate">
          Prompt: {session.prompt}
        </p>
      </div>
    </div>
  )
}

function StreamEventRow({ event }: { event: StreamEvent }) {
  const typeColors: Record<string, string> = {
    system: 'text-blue-400',
    assistant: 'text-ink',
    tool_use: 'text-accent',
    tool_result: 'text-green-400',
    result: 'text-green-400',
    error: 'text-red-400',
  }

  const eventType = event.type ?? 'system'
  const toolName = event.toolName ?? event.tool_name
  const content = event.content
  const text = event.text

  return (
    <div className={cn(
      'py-1 px-2 rounded-[var(--radius-sm)] hover:bg-surface-elevated/50 transition-colors',
      eventType === 'error' && 'bg-red-500/5',
    )}>
      <span className={cn('font-semibold', typeColors[eventType] ?? 'text-ink-muted')}>
        [{eventType}]
      </span>
      {toolName && (
        <span className="ml-2 text-accent">{String(toolName)}</span>
      )}
      {(content || text) && (
        <span className="ml-2 text-ink-secondary line-clamp-3">{String(content || text)}</span>
      )}
      {!toolName && !content && !text && (
        <span className="ml-2 text-ink-disabled truncate">{JSON.stringify(event).slice(0, 200)}</span>
      )}
    </div>
  )
}
