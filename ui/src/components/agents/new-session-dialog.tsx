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
import type { Attachment } from '@/data/sessions'
import { sessions } from '@/data/sessions'

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

const permissionModes = [
  { id: 'default', label: 'Default' },
  { id: 'plan', label: 'Plan' },
  { id: 'auto', label: 'Auto' },
  { id: 'bypassPermissions', label: 'Bypass' },
] as const

const DEFAULT_DIR = '/Users/dev/project'

export function NewSessionDialog({ open, onOpenChange, onCreated }: NewSessionDialogProps) {
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [model, setModel] = useState('sonnet')
  const [targetDir, setTargetDir] = useState(DEFAULT_DIR)
  const [permissionMode, setPermissionMode] = useState('default')

  // Get capabilities from first session that has them
  const mockCapabilities = sessions.find((s) => s.capabilities)?.capabilities ?? null

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() && attachments.length === 0) return

    toast.success('Session started (demo)')
    setPrompt('')
    setAttachments([])
    onOpenChange(false)
    onCreated?.('ses-new-demo')
  }, [prompt, attachments, onOpenChange, onCreated])

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
              capabilities={mockCapabilities}
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

          {/* Target directory */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Target Directory
            </label>
            <Input
              value={targetDir}
              onChange={(e) => setTargetDir(e.target.value)}
              placeholder="/path/to/project"
              className="font-mono text-xs"
            />
          </div>

          {/* Permission mode */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Permission Mode
            </label>
            <div className="flex gap-2">
              {permissionModes.map((pm) => (
                <button
                  key={pm.id}
                  type="button"
                  onClick={() => setPermissionMode(pm.id)}
                  className={cn(
                    'flex-1 rounded-[var(--radius-md)] border px-3 py-1.5 text-center text-xs font-medium transition-colors cursor-pointer',
                    permissionMode === pm.id
                      ? 'border-accent bg-accent-subtle text-ink'
                      : 'border-edge text-ink-muted hover:border-edge-hover',
                  )}
                >
                  {pm.label}
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
            disabled={!prompt.trim() && attachments.length === 0}
          >
            Start Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
