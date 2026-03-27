import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, CheckCircle2, Loader2, Play, ArrowRight,
  MessageSquare, Zap,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  useCreateSessionMutation,
  useSessionQuery,
  useSessionEventsQuery,
  useAnswerSessionMutation,
} from '@/hooks/use-sessions'
import type { Capture, SessionEvent } from '@/types'

interface TriageDialogProps {
  captures: Capture[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onTriaged: (captureIds: string[]) => void
}

type TriagePhase = 'review' | 'processing' | 'question' | 'complete'

interface ParsedQuestion {
  text: string
  options: string[]
  context?: string
}

export function TriageDialog({ captures, open, onOpenChange, onTriaged }: TriageDialogProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<TriagePhase>('review')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [currentQuestion, setCurrentQuestion] = useState<ParsedQuestion | null>(null)

  const createSession = useCreateSessionMutation()
  const answerMutation = useAnswerSessionMutation()
  const { data: session } = useSessionQuery(sessionId ?? undefined)
  const { data: eventsData } = useSessionEventsQuery(sessionId ?? undefined)

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setPhase('review')
      setSessionId(null)
      setSelectedAnswer(null)
      setCurrentQuestion(null)
    }
  }, [open])

  // Watch session status for phase transitions
  useEffect(() => {
    if (!session) return

    if (session.status === 'waiting_input' && phase !== 'question') {
      // Session is asking a question — find it in events
      const question = extractLatestQuestion(eventsData?.events ?? [])
      if (question) {
        setCurrentQuestion(question)
        setPhase('question')
      }
    } else if (session.status === 'completed' && phase !== 'complete') {
      setPhase('complete')
    } else if (session.status === 'failed' && phase !== 'complete') {
      toast.error('Triage session failed')
      setPhase('complete')
    }
  }, [session?.status, phase, eventsData?.events])

  const handleStartTriage = useCallback(() => {
    const captureTexts = captures
      .map((c, i) => `Capture ${i + 1}: "${c.text}"`)
      .join('\n')

    const prompt = `Triage the following captures into an Epic with Beads breakdown. Analyze each capture, determine the scope, and create a structured Epic.

${captureTexts}

For each capture:
1. Analyze what change is being requested
2. Determine priority (P0-P3) and type (feature/bug/task)
3. Create an Epic title and description
4. Break down into Beads (sub-tasks)
5. Suggest labels

Output a summary of the Epic and Beads you would create.`

    setPhase('processing')
    createSession.mutate(
      { prompt, model: 'sonnet', name: `Triage: ${captures.length} capture(s)` },
      {
        onSuccess: (data) => {
          setSessionId(data.session.id)
        },
        onError: (err) => {
          toast.error(`Failed to start triage: ${err.message}`)
          setPhase('review')
        },
      },
    )
  }, [captures, createSession])

  const handleAnswerQuestion = useCallback(() => {
    if (!selectedAnswer || !sessionId) return

    answerMutation.mutate(
      { sessionId, answer: selectedAnswer },
      {
        onSuccess: () => {
          setSelectedAnswer(null)
          setCurrentQuestion(null)
          setPhase('processing')
        },
        onError: (err) => {
          toast.error(`Failed to send answer: ${err.message}`)
        },
      },
    )
  }, [selectedAnswer, sessionId, answerMutation])

  const handleSkipQuestion = useCallback(() => {
    if (!sessionId) return
    answerMutation.mutate(
      { sessionId, answer: 'Let the agent decide' },
      {
        onSuccess: () => {
          setSelectedAnswer(null)
          setCurrentQuestion(null)
          setPhase('processing')
        },
      },
    )
  }, [sessionId, answerMutation])

  const handleClose = useCallback(() => {
    if (session?.status === 'completed') {
      onTriaged(captures.map((c) => c.id))
      toast.success('Triage complete')
    }
    onOpenChange(false)
  }, [session?.status, captures, onTriaged, onOpenChange])

  const handleViewOnBoard = useCallback(() => {
    onTriaged(captures.map((c) => c.id))
    onOpenChange(false)
    toast.success('Triage complete — view on board')
    navigate('/board')
  }, [captures, onTriaged, onOpenChange, navigate])

  const handleStartSession = useCallback(() => {
    onTriaged(captures.map((c) => c.id))
    onOpenChange(false)
    toast.success('Triage complete — opening agent sessions')
    navigate('/agents')
  }, [captures, onTriaged, onOpenChange, navigate])

  // Extract assistant messages for processing display
  const events = eventsData?.events ?? []
  const assistantMessages = events
    .filter((e: SessionEvent) => e.eventType === 'assistant' || e.eventType === 'system')
    .map((e: SessionEvent) => {
      const data = typeof e.data === 'string' ? safeParseJSON(e.data) : e.data as Record<string, unknown>
      return (data?.content as string) ?? ''
    })
    .filter(Boolean)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {phase === 'review' && 'Triage Captures'}
            {phase === 'processing' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-accent" />
                Agent is analyzing...
              </>
            )}
            {phase === 'question' && (
              <>
                <MessageSquare className="h-4 w-4 text-accent" />
                Agent needs your input
              </>
            )}
            {phase === 'complete' && (
              <>
                <CheckCircle2 className="h-4 w-4 text-success" />
                Triage Complete
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {phase === 'review' && `Review ${captures.length} capture${captures.length > 1 ? 's' : ''} before starting the AI-powered triage.`}
            {phase === 'processing' && 'Claude Code is analyzing the captures and codebase to create a structured Epic.'}
            {phase === 'question' && 'The agent has a question about the triage scope.'}
            {phase === 'complete' && 'The triage session has finished. Review the results below.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 pr-3">

            {/* ── REVIEW PHASE ── */}
            {phase === 'review' && (
              <>
                <div>
                  <label className="mb-2 block text-xs font-medium text-ink-secondary">
                    Selected captures ({captures.length})
                  </label>
                  <div className="flex flex-col gap-2">
                    {captures.map((capture) => (
                      <div
                        key={capture.id}
                        className="rounded-[var(--radius-lg)] border border-edge bg-surface-elevated p-3"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs font-medium text-ink-secondary">{capture.user?.name ?? 'Unknown'}</span>
                          <span className="text-[11px] text-ink-disabled">
                            {formatDistanceToNow(capture.createdAt * 1000, { addSuffix: true })}
                          </span>
                        </div>
                        <p className="text-sm text-ink leading-relaxed">{capture.text}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="rounded-[var(--radius-lg)] border border-edge bg-surface-base p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-accent-muted">
                      <Bot className="h-4 w-4 text-accent" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">AI-powered triage</p>
                      <p className="mt-1 text-xs text-ink-muted leading-relaxed">
                        Claude Code will analyze these captures against the codebase, search for related patterns,
                        and create a structured Epic with Beads. It may ask you a few questions to clarify scope.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleStartTriage} className="gap-2" disabled={createSession.isPending}>
                    {createSession.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Zap className="h-3.5 w-3.5" />
                    )}
                    Start Triage
                  </Button>
                </div>
              </>
            )}

            {/* ── PROCESSING PHASE ── */}
            {phase === 'processing' && (
              <div className="flex flex-col gap-3 py-4">
                {assistantMessages.length > 0 ? (
                  assistantMessages.slice(-5).map((msg, i) => (
                    <div key={i} className="flex items-start gap-3 px-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success mt-0.5" />
                      <span className="text-sm text-ink-secondary line-clamp-2">{msg}</span>
                    </div>
                  ))
                ) : (
                  <div className="flex items-center gap-3 px-2">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                    <span className="text-sm text-ink">Starting triage analysis...</span>
                  </div>
                )}
                <div className="flex items-center gap-3 px-2">
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                  <span className="text-sm text-ink">Processing...</span>
                </div>
              </div>
            )}

            {/* ── QUESTION PHASE ── */}
            {phase === 'question' && currentQuestion && (
              <>
                <div className="rounded-[var(--radius-lg)] border border-accent/20 bg-accent-subtle p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-muted">
                      <Bot className="h-3.5 w-3.5 text-accent" />
                    </div>
                    <div className="flex-1">
                      {currentQuestion.context && (
                        <p className="mb-2 text-[11px] text-ink-muted font-mono">
                          {currentQuestion.context}
                        </p>
                      )}
                      <p className="text-sm text-ink leading-relaxed">
                        {currentQuestion.text}
                      </p>
                    </div>
                  </div>
                </div>

                {currentQuestion.options.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {currentQuestion.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setSelectedAnswer(option)}
                        className={cn(
                          'rounded-[var(--radius-md)] border px-4 py-3 text-left text-sm transition-all cursor-pointer',
                          selectedAnswer === option
                            ? 'border-accent bg-accent-muted text-ink'
                            : 'border-edge bg-surface-base text-ink-secondary hover:bg-surface-elevated hover:border-edge-hover',
                        )}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleSkipQuestion}
                    disabled={answerMutation.isPending}
                    className="text-xs text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer"
                  >
                    Skip — let agent decide
                  </button>
                  <Button
                    size="sm"
                    onClick={handleAnswerQuestion}
                    disabled={!selectedAnswer || answerMutation.isPending}
                    className="gap-1.5"
                  >
                    {answerMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <ArrowRight className="h-3.5 w-3.5" />
                    )}
                    Continue
                  </Button>
                </div>
              </>
            )}

            {/* ── COMPLETE PHASE ── */}
            {phase === 'complete' && (
              <>
                {/* Show assistant output as results */}
                <div className="rounded-[var(--radius-xl)] border border-success/20 bg-success/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="accent">Triage Result</Badge>
                    {session?.status === 'failed' && (
                      <Badge variant="error">Session Failed</Badge>
                    )}
                  </div>
                  {assistantMessages.length > 0 ? (
                    <div className="text-sm text-ink leading-relaxed whitespace-pre-wrap">
                      {assistantMessages.slice(-3).join('\n\n')}
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">No output from triage session.</p>
                  )}
                </div>

                <Separator />

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" className="gap-1.5 text-ink-muted" onClick={handleStartSession}>
                    <Play className="h-3 w-3" />
                    Start Agent Session
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleClose}>
                      Close
                    </Button>
                    <Button size="sm" className="gap-1.5" onClick={handleViewOnBoard}>
                      View on Board
                      <ArrowRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractLatestQuestion(events: SessionEvent[]): ParsedQuestion | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    const data = typeof event.data === 'string' ? safeParseJSON(event.data) : event.data as Record<string, unknown>
    if (!data) continue

    // Check for questionData
    const qd = data.questionData as Record<string, unknown> | undefined
    if (qd?.text) {
      return {
        text: qd.text as string,
        options: (qd.options as string[]) ?? [],
        context: (qd.context as string) ?? undefined,
      }
    }

    // Check for AskUserQuestion tool_use
    if (event.eventType === 'tool_use' && data.toolName === 'AskUserQuestion') {
      const inputStr = data.toolInput as string
      const input = safeParseJSON(inputStr)
      if (input?.question) {
        return {
          text: input.question as string,
          options: (input.options as string[]) ?? [],
          context: (input.context as string) ?? undefined,
        }
      }
    }
  }
  return null
}

function safeParseJSON(str: unknown): Record<string, unknown> | null {
  if (typeof str !== 'string') return str as Record<string, unknown> | null
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}
