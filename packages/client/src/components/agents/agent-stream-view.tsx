import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { ArrowDown } from 'lucide-react'
import { StreamEvent } from './stream-event'
import { useSessionEventsQuery, useAnswerSessionMutation, parseSessionEvent } from '@/hooks/use-sessions'
import { useSessionQuery } from '@/hooks/use-sessions'
import { cn } from '@/lib/utils'

interface AgentStreamViewProps {
  sessionId: string
  scrollTarget?: { eventId: number; seq: number } | null
}

/** How close to the bottom (in px) counts as "at the bottom" */
const SCROLL_THRESHOLD = 80

export function AgentStreamView({ sessionId, scrollTarget }: AgentStreamViewProps) {
  const { data: session } = useSessionQuery(sessionId)
  const { data: eventsData } = useSessionEventsQuery(sessionId)
  const answerMutation = useAnswerSessionMutation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const eventRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [hasNewBelow, setHasNewBelow] = useState(false)
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null)
  const prevEventCount = useRef(0)

  const events = useMemo(() => {
    if (!eventsData?.events) return []
    return eventsData.events.map(parseSessionEvent)
  }, [eventsData])

  const isRunning = session?.status === 'running'
  const isWaitingInput = session?.status === 'waiting_input'
  const isTerminal = session?.status === 'completed' || session?.status === 'failed' || session?.status === 'cancelled'

  // ── Check if scrolled to bottom ────────────────────────────────────────

  const checkIfAtBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return true
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    return distanceFromBottom < SCROLL_THRESHOLD
  }, [])

  const handleScroll = useCallback(() => {
    const atBottom = checkIfAtBottom()
    setIsAtBottom(atBottom)
    if (atBottom) setHasNewBelow(false)
  }, [checkIfAtBottom])

  // ── Auto-scroll on new events (only if already at bottom) ──────────────

  useEffect(() => {
    if (events.length === prevEventCount.current) return
    prevEventCount.current = events.length

    if (isAtBottom) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    } else {
      setHasNewBelow(true)
    }
  }, [events.length, isAtBottom])

  // ── Scroll to bottom on initial load or session change ─────────────────

  useEffect(() => {
    eventRefs.current.clear()
    setIsAtBottom(true)
    setHasNewBelow(false)
    setHighlightedEventId(null)
    prevEventCount.current = 0
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView()
    })
  }, [sessionId])

  // ── Scroll to specific event when requested by step tree ────────────────

  useEffect(() => {
    if (!scrollTarget) return
    const el = eventRefs.current.get(scrollTarget.eventId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlightedEventId(scrollTarget.eventId)
      const timer = setTimeout(() => setHighlightedEventId(null), 1500)
      return () => clearTimeout(timer)
    }
  }, [scrollTarget])

  // ── Force scroll when question appears (waiting_input) ──────────────────

  useEffect(() => {
    if (isWaitingInput) {
      requestAnimationFrame(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      })
    }
  }, [isWaitingInput])

  // ── Jump to bottom action ──────────────────────────────────────────────

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    setIsAtBottom(true)
    setHasNewBelow(false)
  }, [])

  // Detect if the last event signals the session has stopped (handles race condition
  // where the event arrives before the session status update via Socket.IO)
  const lastEvent = events.at(-1)
  const lastEventIsTerminal = lastEvent != null && (
    lastEvent.type === 'result' ||
    lastEvent.type === 'error' ||
    (lastEvent.type === 'system' && /token.?limit|stopped|terminated|exceeded/i.test(lastEvent.content))
  )

  // Don't show thinking indicator if the last event or session status signals termination
  const showThinking = isRunning && !isTerminal && !lastEventIsTerminal

  // Find the last AskUserQuestion event to attach inline answer UI
  const lastAskEventId = events
    .filter((e) => e.type === 'tool_use' && e.toolName === 'AskUserQuestion')
    .at(-1)?.id

  const handleAnswer = useCallback((answer: string) => {
    answerMutation.mutate({ sessionId, answer })
  }, [sessionId, answerMutation])

  return (
    <div className="relative h-full overflow-hidden">
      {/* Scrollable container */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto scroll-smooth"
      >
        <div className="flex min-h-full flex-col justify-end gap-3 p-4">
          {events.length === 0 && showThinking && (
            <div className="flex items-center gap-2 pl-1 pt-4">
              <span className="h-4 w-1.5 rounded-sm bg-accent animate-cursor" />
              <span className="text-xs text-ink-muted">Waiting for agent output...</span>
            </div>
          )}

          {events.length === 0 && !isRunning && session?.status !== 'queued' && (
            <div className="flex items-center justify-center py-12">
              <span className="text-sm text-ink-disabled">No events yet</span>
            </div>
          )}

          {events.map((event) => {
            const isAskEvent = event.type === 'tool_use' && event.toolName === 'AskUserQuestion'
            const isLastAsk = isAskEvent && event.id === lastAskEventId
            const isHighlighted = event.id === highlightedEventId
            return (
              <div
                key={event.id}
                ref={(el) => {
                  if (el) eventRefs.current.set(event.id, el)
                  else eventRefs.current.delete(event.id)
                }}
                className={cn(
                  'transition-all duration-500',
                  isHighlighted && 'ring-2 ring-accent/40 rounded-[var(--radius-md)]',
                )}
              >
                <StreamEvent
                  event={event}
                  question={isAskEvent ? event.questionData : undefined}
                  isWaitingInput={isLastAsk && !!isWaitingInput}
                  onAnswer={isLastAsk && isWaitingInput ? handleAnswer : undefined}
                />
              </div>
            )
          })}

          {showThinking && events.length > 0 && (
            <div className="flex items-center gap-1 pl-1 pt-1">
              <span className="h-4 w-1.5 rounded-sm bg-accent animate-cursor" />
              <span className="text-xs text-ink-muted">Agent is thinking...</span>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={bottomRef} className="h-px" />
        </div>
      </div>

      {/* Scroll-to-bottom button */}
      <div
        className={cn(
          'absolute bottom-4 left-1/2 -translate-x-1/2 transition-all duration-200',
          !isAtBottom ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={scrollToBottom}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-elevated)] transition-colors cursor-pointer',
            hasNewBelow
              ? 'border-accent/40 bg-accent text-surface-base hover:bg-accent-hover'
              : 'border-edge bg-surface-overlay text-ink-secondary hover:bg-surface-elevated',
          )}
        >
          <ArrowDown className="h-3 w-3" />
          {hasNewBelow ? 'New messages' : 'Scroll to bottom'}
        </button>
      </div>

      {/* Top fade gradient (when scrolled down) */}
      <div
        className={cn(
          'pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-surface-base to-transparent transition-opacity duration-200',
          scrollRef.current && scrollRef.current.scrollTop > 20 ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  )
}
