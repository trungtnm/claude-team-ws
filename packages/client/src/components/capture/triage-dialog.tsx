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
import type { Capture } from '@/types'

interface TriageDialogProps {
  captures: Capture[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onTriaged: (captureIds: string[]) => void
}

type TriagePhase = 'review' | 'processing' | 'question' | 'complete'

interface TriageQuestion {
  id: string
  text: string
  options: string[]
  context?: string
}

interface TriageResult {
  epicTitle: string
  epicDescription: string
  priority: string
  type: string
  beads: { title: string; type: string; priority: string }[]
  labels: string[]
  estimatedEffort: string
}

// Simulated questions the agent might ask during triage
const simulatedQuestions: TriageQuestion[] = [
  {
    id: 'q1',
    text: 'Based on the captures, this looks like it involves both frontend and backend changes. Should I scope the Epic to cover the full stack, or split into separate frontend/backend Epics?',
    options: ['Full-stack Epic (single branch)', 'Split into Frontend + Backend Epics', 'Let the agent decide based on complexity'],
    context: 'Analyzing code impact across packages/client and packages/server...',
  },
  {
    id: 'q2',
    text: 'I found 3 related patterns in the codebase that could be affected. Should I include regression testing as a dedicated Bead, or handle it within each implementation Bead?',
    options: ['Dedicated testing Bead (recommended for this scope)', 'Test within each Bead', 'Skip — existing test coverage is sufficient'],
    context: 'Found 12 test files with related coverage. CASS search returned 3 similar past sessions.',
  },
]

// Simulated triage result
const simulatedResult: TriageResult = {
  epicTitle: 'Agent Session File Change Visibility',
  epicDescription: 'Add file change summary to agent session cards and stream view. Show modified files count, list of changed paths, and diff stats before PR review.',
  priority: 'P1',
  type: 'Feature',
  beads: [
    { title: 'Add file tracking to session events storage', type: 'task', priority: 'P1' },
    { title: 'Session card — file change summary component', type: 'task', priority: 'P1' },
    { title: 'Stream view — file list sidebar panel', type: 'task', priority: 'P2' },
    { title: 'Integration tests for file tracking', type: 'task', priority: 'P2' },
  ],
  labels: ['frontend', 'backend', 'agent'],
  estimatedEffort: '~4 hours agent time',
}

const processingSteps = [
  'Analyzing capture content...',
  'Searching codebase for related patterns...',
  'Querying CASS for similar past sessions...',
  'Evaluating scope and dependencies...',
  'Generating Epic structure...',
]

export function TriageDialog({ captures, open, onOpenChange, onTriaged }: TriageDialogProps) {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<TriagePhase>('review')
  const [currentStep, setCurrentStep] = useState(0)
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<TriageResult | null>(null)

  // Reset when dialog opens with new captures
  useEffect(() => {
    if (open) {
      setPhase('review')
      setCurrentStep(0)
      setCurrentQuestionIdx(0)
      setSelectedAnswer(null)
      setAnswers({})
      setResult(null)
    }
  }, [open])

  // Simulate processing steps
  useEffect(() => {
    if (phase !== 'processing') return

    if (currentStep < processingSteps.length) {
      const timer = setTimeout(() => {
        setCurrentStep((s) => s + 1)
      }, 800 + Math.random() * 600)
      return () => clearTimeout(timer)
    }

    // After processing steps, show first question
    const timer = setTimeout(() => {
      setPhase('question')
    }, 500)
    return () => clearTimeout(timer)
  }, [phase, currentStep])

  const handleStartTriage = useCallback(() => {
    setPhase('processing')
    setCurrentStep(0)
  }, [])

  const handleAnswerQuestion = useCallback(() => {
    if (!selectedAnswer) return

    const question = simulatedQuestions[currentQuestionIdx]
    const newAnswers = { ...answers, [question.id]: selectedAnswer }
    setAnswers(newAnswers)
    setSelectedAnswer(null)

    if (currentQuestionIdx < simulatedQuestions.length - 1) {
      // Show brief processing, then next question
      setPhase('processing')
      setCurrentStep(processingSteps.length - 1) // Skip to last step
      setTimeout(() => {
        setCurrentQuestionIdx((i) => i + 1)
        setPhase('question')
      }, 1200)
    } else {
      // All questions answered — show result
      setPhase('processing')
      setCurrentStep(processingSteps.length - 1)
      setTimeout(() => {
        setResult(simulatedResult)
        setPhase('complete')
      }, 1500)
    }
  }, [selectedAnswer, currentQuestionIdx, answers])

  const handleSkipQuestion = useCallback(() => {
    setSelectedAnswer(null)
    if (currentQuestionIdx < simulatedQuestions.length - 1) {
      setCurrentQuestionIdx((i) => i + 1)
    } else {
      setPhase('processing')
      setCurrentStep(processingSteps.length - 1)
      setTimeout(() => {
        setResult(simulatedResult)
        setPhase('complete')
      }, 1500)
    }
  }, [currentQuestionIdx])

  const handleClose = useCallback(() => {
    onTriaged(captures.map((c) => c.id))
    onOpenChange(false)
    toast.success('Epic created and added to board')
  }, [captures, onTriaged, onOpenChange])

  const handleViewOnBoard = useCallback(() => {
    onTriaged(captures.map((c) => c.id))
    onOpenChange(false)
    toast.success('Epic created and added to board')
    // Navigate to board with the new epic highlighted
    navigate('/board?epic=epic-new-triage')
  }, [captures, onTriaged, onOpenChange, navigate])

  const handleStartSession = useCallback(() => {
    onTriaged(captures.map((c) => c.id))
    onOpenChange(false)
    toast.success('Epic created — starting agent session...')
    navigate('/agents')
  }, [captures, onTriaged, onOpenChange, navigate])

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
            {phase === 'question' && `Question ${currentQuestionIdx + 1} of ${simulatedQuestions.length}`}
            {phase === 'complete' && 'The Epic and Beads have been created. Review the results below.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 pr-3">

            {/* ── REVIEW PHASE ── */}
            {phase === 'review' && (
              <>
                {/* Selected captures for review */}
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
                        Claude Code will analyze these captures against the codebase, search for related patterns using CASS,
                        and create a structured Epic with Beads. It may ask you a few questions to clarify scope.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleStartTriage} className="gap-2">
                    <Zap className="h-3.5 w-3.5" />
                    Start Triage
                  </Button>
                </div>
              </>
            )}

            {/* ── PROCESSING PHASE ── */}
            {phase === 'processing' && (
              <div className="flex flex-col gap-2 py-4">
                {processingSteps.map((step, i) => (
                  <div key={step} className="flex items-center gap-3 px-2">
                    {i < currentStep ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : i === currentStep ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent" />
                    ) : (
                      <div className="h-4 w-4 shrink-0 rounded-full border border-edge" />
                    )}
                    <span className={cn(
                      'text-sm transition-colors',
                      i < currentStep ? 'text-ink-muted' : i === currentStep ? 'text-ink' : 'text-ink-disabled',
                    )}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* ── QUESTION PHASE ── */}
            {phase === 'question' && (
              <>
                <div className="rounded-[var(--radius-lg)] border border-accent/20 bg-accent-subtle p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-muted">
                      <Bot className="h-3.5 w-3.5 text-accent" />
                    </div>
                    <div className="flex-1">
                      {simulatedQuestions[currentQuestionIdx].context && (
                        <p className="mb-2 text-[11px] text-ink-muted font-mono">
                          {simulatedQuestions[currentQuestionIdx].context}
                        </p>
                      )}
                      <p className="text-sm text-ink leading-relaxed">
                        {simulatedQuestions[currentQuestionIdx].text}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  {simulatedQuestions[currentQuestionIdx].options.map((option) => (
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

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleSkipQuestion}
                    className="text-xs text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer"
                  >
                    Skip — let agent decide
                  </button>
                  <Button
                    size="sm"
                    onClick={handleAnswerQuestion}
                    disabled={!selectedAnswer}
                    className="gap-1.5"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Continue
                  </Button>
                </div>

                {/* Previous answers */}
                {Object.keys(answers).length > 0 && (
                  <div className="mt-2">
                    <Separator />
                    <div className="mt-3 flex flex-col gap-2">
                      <span className="text-[11px] text-ink-disabled">Previous answers</span>
                      {Object.entries(answers).map(([qId, answer]) => {
                        const q = simulatedQuestions.find((sq) => sq.id === qId)
                        return (
                          <div key={qId} className="rounded-[var(--radius-md)] bg-surface-elevated px-3 py-2">
                            <p className="text-[11px] text-ink-muted line-clamp-1">{q?.text}</p>
                            <p className="text-xs text-ink-secondary mt-0.5">{answer}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── COMPLETE PHASE ── */}
            {phase === 'complete' && result && (
              <>
                {/* Epic summary */}
                <div className="rounded-[var(--radius-xl)] border border-success/20 bg-success/5 p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="accent">{result.type}</Badge>
                    <Badge variant={result.priority === 'P0' ? 'error' : result.priority === 'P1' ? 'info' : 'warning'}>
                      {result.priority}
                    </Badge>
                    <span className="text-[11px] text-ink-muted">{result.estimatedEffort}</span>
                  </div>
                  <h3 className="text-base font-semibold text-ink mb-1">{result.epicTitle}</h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">{result.epicDescription}</p>
                  <div className="flex flex-wrap gap-1 mt-3">
                    {result.labels.map((label) => (
                      <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
                    ))}
                  </div>
                </div>

                {/* Beads breakdown */}
                <div>
                  <label className="mb-2 flex items-center gap-2 text-xs font-medium text-ink-secondary">
                    Beads ({result.beads.length})
                    <span className="text-[11px] text-ink-muted font-normal">— auto-generated sub-tasks</span>
                  </label>
                  <div className="flex flex-col gap-1.5">
                    {result.beads.map((bead, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 rounded-[var(--radius-md)] border border-edge bg-surface-raised px-3 py-2.5"
                      >
                        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-medium text-ink-muted">
                          {i + 1}
                        </div>
                        <span className="flex-1 text-sm text-ink">{bead.title}</span>
                        <Badge variant="outline" className="text-[10px]">{bead.type}</Badge>
                        <Badge
                          variant={bead.priority === 'P1' ? 'info' : 'default'}
                          className="text-[10px]"
                        >
                          {bead.priority}
                        </Badge>
                      </div>
                    ))}
                  </div>
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
