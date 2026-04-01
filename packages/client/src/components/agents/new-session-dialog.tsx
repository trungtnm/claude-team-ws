import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Shield, Eye, ShieldCheck, ShieldOff } from 'lucide-react'
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
import { useCreateSessionMutation, useCapabilitiesQuery } from '@/hooks/use-sessions'
import { useRepos } from '@/hooks/use-settings'
import type { Attachment, PermissionMode } from '@/types'

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

const permissionModes: { id: PermissionMode; label: string; icon: React.ComponentType<{ className?: string }>; description: string }[] = [
  { id: 'default', label: 'Default', icon: Shield, description: 'Prompts for each tool' },
  { id: 'plan', label: 'Plan', icon: Eye, description: 'Read-only, no edits' },
  { id: 'acceptEdits', label: 'Auto', icon: ShieldCheck, description: 'Auto-accept edits' },
  { id: 'bypassPermissions', label: 'Bypass', icon: ShieldOff, description: 'Skip all checks' },
]

export function NewSessionDialog({ open, onOpenChange, onCreated }: NewSessionDialogProps) {
  const [sessionName, setSessionName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [model, setModel] = useState('sonnet')
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('default')
  const [targetDir, setTargetDir] = useState('')

  const createMutation = useCreateSessionMutation()
  const { data: capabilities } = useCapabilitiesQuery()
  const { data: repos } = useRepos()
  const readyRepos = repos?.filter((r) => r.status === 'ready') ?? []

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() && attachments.length === 0) return

    createMutation.mutate(
      {
        prompt: prompt.trim(),
        model,
        name: sessionName.trim() || undefined,
        permission_mode: permissionMode,
        target_dir: targetDir.trim() || undefined,
      },
      {
        onSuccess: (data) => {
          toast.success('Session started')
          setSessionName('')
          setPrompt('')
          setAttachments([])
          setPermissionMode('default')
          onOpenChange(false)
          onCreated?.(data.session.id)
        },
        onError: (err) => {
          toast.error(err.message)
        },
      },
    )
  }, [prompt, attachments, model, sessionName, permissionMode, targetDir, createMutation, onOpenChange, onCreated])

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
              capabilities={capabilities ?? null}
              minRows={3}
              maxHeight={200}
              showHint
            />
          </div>

          {/* Repository */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Repository</label>
            {readyRepos.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {readyRepos.map((repo) => (
                  <button
                    key={repo.id}
                    type="button"
                    onClick={() => setTargetDir(repo.path)}
                    className={cn(
                      'flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm transition-colors cursor-pointer',
                      targetDir === repo.path
                        ? 'border-accent bg-accent-subtle text-ink'
                        : 'border-edge text-ink-secondary hover:border-edge-hover hover:bg-surface-elevated',
                    )}
                  >
                    <span className="font-medium">{repo.name}</span>
                    <span className="text-[10px] text-ink-muted font-mono truncate">{repo.defaultBranch}</span>
                    <span className="ml-auto text-[10px] text-ink-disabled font-mono truncate max-w-48">{repo.path}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-muted">No repositories configured. <a href="/settings" className="text-accent hover:underline">Add repos in Settings</a></p>
            )}
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

          {/* Permission Mode */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Permission Mode</label>
            <div className="flex gap-2">
              {permissionModes.map((pm) => {
                const Icon = pm.icon
                return (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPermissionMode(pm.id)}
                    className={cn(
                      'flex-1 rounded-[var(--radius-md)] border px-2 py-2 text-center text-sm transition-colors cursor-pointer',
                      permissionMode === pm.id
                        ? 'border-accent bg-accent-subtle text-ink'
                        : 'border-edge text-ink-secondary hover:border-edge-hover',
                    )}
                  >
                    <Icon className="mx-auto h-4 w-4 mb-0.5" />
                    <div className="text-[11px] font-medium">{pm.label}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createMutation.isPending || (!prompt.trim() && attachments.length === 0) || !targetDir}
          >
            {createMutation.isPending ? 'Starting...' : 'Start Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
