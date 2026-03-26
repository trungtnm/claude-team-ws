import { useState, useCallback } from 'react'
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
import { RichInput } from './rich-input'
import { cn } from '@/lib/utils'
import { useCreateSessionMutation } from '@/hooks/use-sessions'

interface Attachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  data: string
}

interface NewSessionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: (sessionId: string) => void
}

const models = [
  { id: 'sonnet', label: 'Sonnet', description: 'Fast & capable' },
  { id: 'opus', label: 'Opus', description: 'Most capable' },
  { id: 'haiku', label: 'Haiku', description: 'Fastest' },
] as const

export function NewSessionDialog({ open, onOpenChange, onCreated }: NewSessionDialogProps) {
  const [sessionName, setSessionName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [model, setModel] = useState('sonnet')

  const createMutation = useCreateSessionMutation()

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() && attachments.length === 0) return

    createMutation.mutate(
      { prompt: prompt.trim(), model, name: sessionName.trim() || undefined },
      {
        onSuccess: (data) => {
          toast.success('Session started')
          setSessionName('')
          setPrompt('')
          setAttachments([])
          onOpenChange(false)
          onCreated?.(data.session.id)
        },
        onError: (err) => {
          toast.error(err.message)
        },
      },
    )
  }, [prompt, attachments, model, sessionName, createMutation, onOpenChange, onCreated])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New Agent Session</DialogTitle>
          <DialogDescription>
            Spawn a Claude Code agent with a prompt. The agent runs on this machine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Session name (optional) */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Session Name <span className="text-ink-disabled">(optional)</span></label>
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g., Fix auth bug, Add dark mode"
              className="text-sm"
            />
          </div>

          {/* Prompt with rich input */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Prompt</label>
            <RichInput
              value={prompt}
              onChange={setPrompt}
              attachments={attachments}
              onAttachmentsChange={setAttachments}
              onSubmit={handleSubmit}
              placeholder="What should the agent do? (/ for commands, @ for agents)"
              autoFocus
              capabilities={null}
              minRows={3}
              maxHeight={200}
              showHint
            />
          </div>

          {/* Model */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Model</label>
            <div className="flex gap-2">
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  className={cn(
                    'flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                    model === m.id
                      ? 'border-accent bg-accent-subtle text-ink'
                      : 'border-edge text-ink-secondary hover:border-edge-hover',
                  )}
                >
                  <span className="font-medium">{m.label}</span>
                  <span className="ml-1 text-[10px] text-ink-muted">{m.description}</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || (!prompt.trim() && attachments.length === 0)}
          >
            {createMutation.isPending ? 'Starting...' : 'Start Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
