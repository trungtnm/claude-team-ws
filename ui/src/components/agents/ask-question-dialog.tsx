import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { AgentSession } from '@/data/sessions'

interface AskQuestionDialogProps {
  session: AgentSession
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AskQuestionDialog({ session, open, onOpenChange }: AskQuestionDialogProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [otherText, setOtherText] = useState('')
  const isOther = selectedOption === '__other__'

  if (!session.question) return null

  const handleSend = () => {
    toast.success('Answer sent to agent')
    setSelectedOption(null)
    setOtherText('')
    onOpenChange(false)
  }

  const handleSkip = () => {
    toast.info('Agent will decide on its own')
    setSelectedOption(null)
    setOtherText('')
    onOpenChange(false)
  }

  const canSend = selectedOption !== null && (selectedOption !== '__other__' || otherText.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agent Question</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-ink-secondary">{session.agentName}</span> needs your input
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm italic text-ink-secondary">{session.question.text}</p>

          {session.question.context && (
            <p className="rounded-[var(--radius-md)] bg-surface-elevated px-3 py-2 text-xs text-ink-muted">
              {session.question.context}
            </p>
          )}

          <div className="space-y-2">
            {session.question.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setSelectedOption(option)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm transition-colors',
                  selectedOption === option
                    ? 'border-accent bg-accent-subtle text-ink'
                    : 'border-edge text-ink-secondary hover:border-edge-hover hover:bg-surface-elevated',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    selectedOption === option
                      ? 'border-accent bg-accent'
                      : 'border-ink-muted',
                  )}
                >
                  {selectedOption === option && (
                    <span className="h-1.5 w-1.5 rounded-full bg-surface-base" />
                  )}
                </span>
                {option}
              </button>
            ))}

            <button
              type="button"
              onClick={() => setSelectedOption('__other__')}
              className={cn(
                'flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left text-sm transition-colors',
                isOther
                  ? 'border-accent bg-accent-subtle text-ink'
                  : 'border-edge text-ink-secondary hover:border-edge-hover hover:bg-surface-elevated',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  isOther ? 'border-accent bg-accent' : 'border-ink-muted',
                )}
              >
                {isOther && (
                  <span className="h-1.5 w-1.5 rounded-full bg-surface-base" />
                )}
              </span>
              Other
            </button>

            {isOther && (
              <Input
                placeholder="Type your answer..."
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                className="ml-7"
                autoFocus
              />
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleSkip}>
            Skip (let agent decide)
          </Button>
          <Button onClick={handleSend} disabled={!canSend}>
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
