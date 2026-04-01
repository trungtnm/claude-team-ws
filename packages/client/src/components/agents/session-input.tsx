import { useState, useCallback } from 'react'
import { StopCircle } from 'lucide-react'
import { RichInput } from './rich-input'
import { toast } from 'sonner'
import { useSendMessageMutation, useCapabilitiesQuery } from '@/hooks/use-sessions'
import type { AgentSession, Attachment } from '@/types'

interface SessionInputProps {
  session: AgentSession
  onCancel?: () => void
}

export function SessionInput({ session, onCancel }: SessionInputProps) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const sendMessageMutation = useSendMessageMutation()
  const { data: capabilities } = useCapabilitiesQuery()

  const isRunning = session.status === 'running'
  const isIdle = session.status === 'idle'
  const isWaiting = session.status === 'waiting_input'
  const isTerminal = session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled'

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return

    sendMessageMutation.mutate(
      {
        sessionId: session.id,
        message: trimmed,
        attachments: attachments.length > 0 ? attachments : undefined,
      },
      {
        onSuccess: () => {
          setMessage('')
          setAttachments([])
        },
        onError: (err) => {
          toast.error(err.message)
        },
      },
    )
  }, [message, attachments, session.id, sendMessageMutation])

  const placeholder = isTerminal
    ? 'Send message to resume session...'
    : isRunning
      ? 'Interrupt agent... (/ for commands, @ for agents)'
      : isIdle
        ? 'Send follow-up message... (/ for commands, @ for agents)'
        : isWaiting
          ? 'Message... (/ for commands, @ for agents)'
          : 'Message...'

  return (
    <div className="border-t border-edge bg-surface-raised px-4 py-3">
      <RichInput
        value={message}
        onChange={setMessage}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onSubmit={handleSubmit}
        placeholder={placeholder}
        disabled={sendMessageMutation.isPending}
        capabilities={capabilities ?? null}
        leftActions={
          isRunning && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              title="Interrupt agent — pauses to idle"
              className="rounded p-1 text-amber-500/60 hover:text-amber-500 hover:bg-amber-500/10 transition-colors cursor-pointer"
            >
              <StopCircle className="h-3.5 w-3.5" />
            </button>
          ) : undefined
        }
      />
    </div>
  )
}
