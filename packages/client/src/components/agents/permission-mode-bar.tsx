import { Shield, ShieldCheck, ShieldOff, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface PermissionModeBarProps {
  sessionId: string
  currentMode: string
}

const modes = [
  { id: 'default', label: 'Default', icon: Shield, description: 'Prompts for each tool' },
  { id: 'plan', label: 'Plan', icon: Eye, description: 'Read-only, no edits' },
  { id: 'acceptEdits', label: 'Accept Edits', icon: ShieldCheck, description: 'Auto-accept file edits' },
  { id: 'bypassPermissions', label: 'Bypass', icon: ShieldOff, description: 'Skip all checks' },
] as const

export function PermissionModeBar({ currentMode }: PermissionModeBarProps) {
  const handleSwitch = (mode: string) => {
    if (mode === currentMode) return
    toast.info(`Permission: ${mode}`)
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-ink-disabled mr-1">Permission:</span>
      {modes.map((m) => {
        const Icon = m.icon
        const isActive = currentMode === m.id
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => handleSwitch(m.id)}
            title={`${m.label}: ${m.description}`}
            className={cn(
              'flex items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer',
              isActive
                ? 'bg-accent-subtle text-accent border border-accent/30'
                : 'text-ink-disabled hover:text-ink-muted hover:bg-surface-elevated border border-transparent',
            )}
          >
            <Icon className="h-3 w-3" />
            {m.label}
          </button>
        )
      })}
    </div>
  )
}
