import { ArrowRight, Clock, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Capture } from '@/hooks/use-captures'
import { cn } from '@/lib/utils'

interface CaptureCardProps {
  capture: Capture
  onTriage: (capture: Capture) => void
  onDefer: (id: string) => void
  onDismiss: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  highlighted?: boolean
}

function getAgeBorderClass(createdAt: number): string {
  const ageHours = (Date.now() / 1000 - createdAt) / 3600
  if (ageHours < 1) return 'border-l-2 border-l-accent'
  if (ageHours < 24) return 'border-l-2 border-l-ink-muted'
  return 'border-l-2 border-l-error/50'
}

export function CaptureCard({
  capture,
  onTriage,
  onDefer,
  onDismiss,
  selected = false,
  onToggleSelect,
  highlighted = false,
}: CaptureCardProps) {
  const ageBorder = getAgeBorderClass(capture.created_at)
  const userName = capture.user?.name ?? 'Unknown'
  const initials = userName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div
      className={cn(
        'bg-surface-raised rounded-[var(--radius-lg)] p-4 transition-all',
        ageBorder,
        highlighted && 'ring-2 ring-accent/40',
        selected && 'bg-surface-elevated',
      )}
    >
      <div className="flex gap-3">
        {onToggleSelect && (
          <div className="flex pt-0.5">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect(capture.id)}
              className="h-4 w-4 rounded border-edge accent-accent cursor-pointer"
            />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink leading-relaxed">{capture.text}</p>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-medium text-surface-base bg-accent">
              {initials}
            </div>
            <span className="text-[11px] text-ink-muted">{userName}</span>
            <span className="text-[11px] text-ink-disabled">&middot;</span>
            <span className="text-[11px] text-ink-disabled">
              {formatDistanceToNow(capture.created_at * 1000, { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onTriage(capture)}
            className={cn(
              'flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1',
              'text-xs font-medium text-accent bg-accent-muted',
              'transition-colors hover:bg-accent/20 cursor-pointer',
            )}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            Triage
          </button>
          <button
            type="button"
            onClick={() => onDefer(capture.id)}
            className={cn(
              'flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1',
              'text-xs text-ink-muted',
              'transition-colors hover:bg-surface-elevated hover:text-ink-secondary cursor-pointer',
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Defer
          </button>
          <button
            type="button"
            onClick={() => onDismiss(capture.id)}
            className={cn(
              'flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1',
              'text-xs text-ink-muted',
              'transition-colors hover:bg-error/10 hover:text-error cursor-pointer',
            )}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
