import { useState, useCallback } from 'react'
import { StopCircle } from 'lucide-react'
import { RichInput } from './rich-input'
import { toast } from 'sonner'
import type { AgentSession, Attachment } from '@/data/sessions'

interface SessionInputProps {
  session: AgentSession
  onCancel?: () => void
}

export function SessionInput({ session, onCancel }: SessionInputProps) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isSending, setIsSending] = useState(false)

  const isRunning = session.status === 'running'
  const isTerminal = session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled'

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed && attachments.length === 0) return

    setIsSending(true)
    // Mock send — demo only
    setTimeout(() => {
      toast.success('Message sent (demo)')
      setMessage('')
      setAttachments([])
      setIsSending(false)
    }, 300)
  }, [message, attachments])

  if (isTerminal) return null

  return (
    <div className="border-t border-edge bg-surface-raised px-4 py-3">
      <RichInput
        value={message}
        onChange={setMessage}
        attachments={attachments}
        onAttachmentsChange={setAttachments}
        onSubmit={handleSubmit}
        placeholder={isRunning ? 'Interrupt agent... (/ for commands, @ for agents)' : 'Message... (/ for commands, @ for agents)'}
        disabled={isSending}
        capabilities={session.capabilities}
        leftActions={
          isRunning && onCancel ? (
            <button
              type="button"
              onClick={onCancel}
              title="Stop agent"
              className="rounded p-1 text-error/60 hover:text-error hover:bg-error/10 transition-colors cursor-pointer"
            >
              <StopCircle className="h-3.5 w-3.5" />
            </button>
          ) : undefined
        }
      />
    </div>
  )
}
