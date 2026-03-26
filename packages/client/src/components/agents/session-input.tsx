import { useState, useCallback } from 'react'
import { StopCircle } from 'lucide-react'
import { RichInput } from './rich-input'
import { toast } from 'sonner'
import { useResumeSessionMutation } from '@/hooks/use-sessions'
import type { AgentSession } from '@/types'

interface Attachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  data: string
}

interface SessionInputProps {
  session: AgentSession
  onCancel?: () => void
}

export function SessionInput({ session, onCancel }: SessionInputProps) {
  const [message, setMessage] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const resumeMutation = useResumeSessionMutation()

  const isRunning = session.status === 'running'
  const isTerminal = session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled'

  const handleSubmit = useCallback(() => {
    const trimmed = message.trim()
    if (!trimmed) return

    resumeMutation.mutate(
      { sessionId: session.id, prompt: trimmed },
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
  }, [message, session.id, resumeMutation])

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
        disabled={resumeMutation.isPending}
        capabilities={null}
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
