import { useState } from 'react'
import Markdown from 'react-markdown'
import {
  Terminal,
  MessageSquare,
  User,
  Wrench,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronRight,
  DollarSign,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParsedStreamEvent } from '@/hooks/use-sessions'

/** Redact sensitive values from stream text (defense in depth) */
const SENSITIVE_PATTERNS = [
  // API keys and Bearer tokens
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
  // Common env var values leaked via echo/printenv
  /(?:CTW_API_KEY|ADMIN_API_KEY|JWT_SECRET|ANTHROPIC_API_KEY|API_KEY)=\S+/g,
  // Explicit key-value patterns from env dumps
  /(?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*\S+/gi,
]

function redactSensitive(text: string): string {
  let result = text
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, '[REDACTED]')
  }
  return result
}

interface SessionQuestion {
  text: string
  options: string[]
  context: string
}

interface StreamEventProps {
  event: ParsedStreamEvent
  /** For AskUserQuestion: the current question data */
  question?: SessionQuestion | null
  /** Whether the session is currently waiting for input */
  isWaitingInput?: boolean
  /** Callback to send an answer */
  onAnswer?: (answer: string) => void
}

// Markdown prose styling for assistant & user messages
function Prose({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div className={`prose-stream ${className}`}>
      <Markdown
        components={{
          // Headings
          h1: ({ children }) => <h1 className="mt-4 mb-2 text-base font-bold text-ink">{children}</h1>,
          h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-sm font-bold text-ink">{children}</h2>,
          h3: ({ children }) => <h3 className="mt-2 mb-1 text-sm font-semibold text-ink">{children}</h3>,
          // Paragraphs
          p: ({ children }) => <p className="mb-2 text-sm leading-relaxed text-ink">{children}</p>,
          // Lists
          ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 text-sm text-ink">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 text-sm text-ink">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-relaxed text-ink">{children}</li>,
          // Inline code
          code: ({ children, className }) => {
            const isBlock = className?.includes('language-')
            if (isBlock) {
              return (
                <code className="block overflow-x-auto rounded-[var(--radius-sm)] bg-surface-base p-3 font-mono text-xs text-ink-secondary">
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded-[3px] bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-accent">
                {children}
              </code>
            )
          },
          // Code blocks
          pre: ({ children }) => <pre className="mb-2 overflow-x-auto rounded-[var(--radius-md)] bg-surface-base p-3 font-mono text-xs">{children}</pre>,
          // Bold / italic
          strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
          em: ({ children }) => <em className="italic text-ink-secondary">{children}</em>,
          // Blockquote
          blockquote: ({ children }) => (
            <blockquote className="mb-2 border-l-2 border-accent/40 pl-3 italic text-ink-secondary">
              {children}
            </blockquote>
          ),
          // Horizontal rule
          hr: () => <hr className="my-3 border-edge" />,
          // Links
          a: ({ children, href }) => (
            <a href={href} className="text-accent underline underline-offset-2 hover:text-accent-hover" target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          // Tables
          table: ({ children }) => (
            <div className="mb-2 overflow-x-auto"><table className="w-full text-xs">{children}</table></div>
          ),
          th: ({ children }) => <th className="border border-edge bg-surface-elevated px-2 py-1 text-left font-semibold text-ink-secondary">{children}</th>,
          td: ({ children }) => <td className="border border-edge px-2 py-1 text-ink">{children}</td>,
        }}
      >
        {children}
      </Markdown>
    </div>
  )
}

export function StreamEvent({ event, question, isWaitingInput, onAnswer }: StreamEventProps) {
  const [expanded, setExpanded] = useState(false)

  if (event.type === 'system') {
    // Hide context window events — data is shown in the stats bar instead
    if (event.contextWindow || /^Context:\s*\d+%/i.test(event.content)) {
      return null
    }
    // Hide session idle messages — the input placeholder and status badge convey this
    if (/session idle/i.test(event.content)) {
      return null
    }
    // Show token limit / session stopped events as warnings
    const isStopEvent = /token.?limit|stopped|terminated|exceeded|context.?limit/i.test(event.content)
    if (isStopEvent) {
      return (
        <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span className="text-xs text-amber-400">{event.content}</span>
        </div>
      )
    }
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
        <MessageSquare className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-secondary" />
        <div className="min-w-0 flex-1">
          <Prose>{event.content}</Prose>
        </div>
      </div>
    )
  }

  if (event.type === 'user_message') {
    const imageAttachments = event.attachments?.filter((a) => a.type === 'image') ?? []
    const fileAttachments = event.attachments?.filter((a) => a.type === 'file') ?? []

    return (
      <div className="rounded-[var(--radius-md)] border border-accent/20 bg-accent-subtle px-3 py-2">
        <div className="flex items-start gap-2">
          <User className="mt-1 h-3.5 w-3.5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <Prose>{event.content.split('\n\n')[0]}</Prose>
          </div>
        </div>

        {/* Image thumbnails */}
        {imageAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 pl-6">
            {imageAttachments.map((att, i) => (
              <div key={i} className="group relative">
                <img
                  src={`data:${att.mimeType};base64,${att.data}`}
                  alt={att.name}
                  className="h-24 max-w-48 rounded-[var(--radius-sm)] border border-edge object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white">
                  {att.name}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* File badges */}
        {fileAttachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
            {fileAttachments.map((att, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] border border-edge bg-surface-elevated px-2 py-0.5 text-xs text-ink-secondary">
                {att.name}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (event.type === 'tool_use') {
    // Special rendering for AskUserQuestion
    if (event.toolName === 'AskUserQuestion' && (question || event.questionData)) {
      const questionData = question ?? event.questionData
      if (questionData) {
        return <InlineQuestionCard question={questionData} isWaiting={!!isWaitingInput} onAnswer={onAnswer} />
      }
    }

    return (
      <div className="rounded-[var(--radius-md)] border border-edge bg-surface-elevated/50">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-elevated cursor-pointer"
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
          )}
          <Wrench className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="text-xs font-medium text-ink-secondary">{event.toolName}</span>
          {event.toolInput && (
            <span className="truncate text-xs font-mono text-ink-muted">{redactSensitive(event.toolInput)}</span>
          )}
        </button>
        {expanded && event.toolResult && (
          <div className="border-t border-edge px-3 py-2 max-h-80 overflow-auto">
            <pre className="whitespace-pre-wrap font-mono text-xs text-ink-muted">
              {redactSensitive(event.toolResult)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  if (event.type === 'tool_result') {
    // Skip standalone tool_result — content is attached to tool_use via toolResult
    return null
  }

  if (event.type === 'result') {
    // Extract just the cost/duration metadata — skip duplicated result text
    const metaParts = event.content.split(' | ').filter(
      (p) => p.startsWith('Cost:') || p.startsWith('Duration:')
    )
    if (metaParts.length === 0) return null

    return (
      <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-success/20 bg-success/5 px-3 py-2">
        <DollarSign className="h-3.5 w-3.5 shrink-0 text-success" />
        <span className="text-xs text-success">{metaParts.join('  ·  ')}</span>
      </div>
    )
  }

  if (event.type === 'error') {
    return (
      <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-error/20 bg-error/5 px-3 py-2">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-error" />
        <span className="text-sm text-error/90">{event.content}</span>
      </div>
    )
  }

  return null
}

// ── Inline question card for AskUserQuestion ────────────────────────────

function InlineQuestionCard({
  question,
  isWaiting,
  onAnswer,
}: {
  question: SessionQuestion
  isWaiting: boolean
  onAnswer?: (answer: string) => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [otherText, setOtherText] = useState('')
  const [answered, setAnswered] = useState(false)
  const [showDetails, setShowDetails] = useState(false)
  const isOther = selected === '__other__'

  const handleSend = () => {
    const answer = isOther ? otherText.trim() : selected
    if (!answer || !onAnswer) return
    onAnswer(answer)
    setAnswered(true)
  }

  if (answered) {
    const answer = isOther ? otherText : selected
    return (
      <div className="rounded-[var(--radius-md)] border border-accent/20 bg-accent-subtle">
        {/* Collapsed: show answer with expand toggle */}
        <button
          type="button"
          onClick={() => setShowDetails(!showDetails)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left cursor-pointer hover:bg-surface-elevated/30 transition-colors"
        >
          {showDetails ? <ChevronDown className="h-3.5 w-3.5 text-ink-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-muted" />}
          <HelpCircle className="h-3.5 w-3.5 text-accent" />
          <span className="text-xs text-ink-muted">{question.text}</span>
          <span className="ml-auto shrink-0 rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">{answer}</span>
        </button>

        {/* Expanded: show all options */}
        {showDetails && (
          <div className="border-t border-edge px-4 py-2 space-y-1">
            {question.options.map((opt) => (
              <div key={opt} className={cn(
                'flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-xs',
                opt === answer ? 'bg-accent/10 text-accent font-medium' : 'text-ink-muted',
              )}>
                <span className={cn(
                  'flex h-3 w-3 shrink-0 items-center justify-center rounded-full border',
                  opt === answer ? 'border-accent bg-accent' : 'border-ink-disabled',
                )}>
                  {opt === answer && <span className="h-1 w-1 rounded-full bg-surface-base" />}
                </span>
                {opt}
              </div>
            ))}
            {isOther && (
              <div className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-xs bg-accent/10 text-accent font-medium">
                <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full border border-accent bg-accent">
                  <span className="h-1 w-1 rounded-full bg-surface-base" />
                </span>
                Other: {otherText}
              </div>
            )}
            {question.context && (
              <p className="mt-1 text-[10px] text-ink-disabled font-mono">{question.context}</p>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn(
      'rounded-[var(--radius-md)] border px-4 py-3',
      isWaiting ? 'border-amber-500/30 bg-amber-500/5' : 'border-edge bg-surface-elevated/50',
    )}>
      {/* Question header */}
      <div className="flex items-start gap-2">
        <HelpCircle className={cn('mt-0.5 h-4 w-4 shrink-0', isWaiting ? 'text-amber-400' : 'text-ink-muted')} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">{question.text}</p>
          {question.context && (
            <p className="mt-1 rounded bg-surface-base px-2 py-1 text-xs text-ink-muted font-mono">
              {question.context}
            </p>
          )}
        </div>
      </div>

      {/* Options */}
      {isWaiting && question.options.length > 0 && (
        <div className="mt-3 space-y-1.5 pl-6">
          {question.options.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSelected(opt)}
              className={cn(
                'flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                selected === opt
                  ? 'border-accent bg-accent-subtle text-ink'
                  : 'border-edge text-ink-secondary hover:border-edge-hover hover:bg-surface-elevated',
              )}
            >
              <span className={cn(
                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                selected === opt ? 'border-accent bg-accent' : 'border-ink-disabled',
              )}>
                {selected === opt && <span className="h-1.5 w-1.5 rounded-full bg-surface-base" />}
              </span>
              {opt}
            </button>
          ))}

          {/* Other option */}
          <button
            type="button"
            onClick={() => setSelected('__other__')}
            className={cn(
              'flex w-full items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
              isOther
                ? 'border-accent bg-accent-subtle text-ink'
                : 'border-edge text-ink-secondary hover:border-edge-hover hover:bg-surface-elevated',
            )}
          >
            <span className={cn(
              'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
              isOther ? 'border-accent bg-accent' : 'border-ink-disabled',
            )}>
              {isOther && <span className="h-1.5 w-1.5 rounded-full bg-surface-base" />}
            </span>
            Other
          </button>

          {isOther && (
            <input
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
              placeholder="Type your answer..."
              autoFocus
              className="ml-6 w-[calc(100%-1.5rem)] rounded-[var(--radius-sm)] border border-edge bg-surface-base px-3 py-1.5 text-sm text-ink placeholder:text-ink-disabled focus:outline-none focus:ring-2 focus:ring-[var(--border-focus)]"
            />
          )}

          {/* Send button */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleSend}
              disabled={!selected || (isOther && !otherText.trim())}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-accent px-3 py-1.5 text-xs font-medium text-surface-base hover:bg-accent-hover disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
            >
              <Send className="h-3 w-3" />
              Send Answer
            </button>
            <button
              type="button"
              onClick={() => { onAnswer?.('Let the agent decide'); setAnswered(true) }}
              className="text-xs text-ink-muted hover:text-ink-secondary cursor-pointer"
            >
              Skip
            </button>
          </div>
        </div>
      )}

      {/* Not waiting — question was already answered or skipped */}
      {!isWaiting && (
        <p className="mt-1 pl-6 text-[11px] text-ink-disabled italic">Waiting for answer...</p>
      )}
    </div>
  )
}
