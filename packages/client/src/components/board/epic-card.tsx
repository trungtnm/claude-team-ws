import { ExternalLink } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { PriorityBadge } from '@/components/board/priority-badge'
import { useBoardStore } from '@/stores/board-store'
import { getInitials, getUserColor } from '@/lib/user-utils'
import { useMembers } from '@/hooks/use-settings'
import { formatDistanceToNow } from 'date-fns'
import type { BoardEpic as Epic } from '@/types'

const typeColors: Record<string, string> = {
  feature: 'text-blue-400 bg-blue-400/10',
  bug: 'text-red-400 bg-red-400/10',
  task: 'text-green-400 bg-green-400/10',
  docs: 'text-purple-400 bg-purple-400/10',
}

interface EpicCardProps {
  epic: Epic
  isDragOverlay?: boolean
}

export function EpicCard({ epic, isDragOverlay = false }: EpicCardProps) {
  const setSelectedEpicId = useBoardStore((s) => s.setSelectedEpicId)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: epic.id,
    data: { epic },
    disabled: isDragOverlay,
  })
  const { data: members = [] } = useMembers()
  const member = members.find((m) => m.userId === epic.assigneeId)
  const assignee = member
    ? { name: member.name, initials: getInitials(member.name), color: getUserColor(member.userId) }
    : undefined
  const needsInput = epic.agentStatus === 'waiting_input'
  const progressPercent =
    epic.beadProgress.total > 0
      ? (epic.beadProgress.done / epic.beadProgress.total) * 100
      : 0

  return (
    <button
      ref={isDragOverlay ? undefined : setNodeRef}
      type="button"
      onClick={() => setSelectedEpicId(epic.id)}
      {...(isDragOverlay ? {} : { ...listeners, ...attributes })}
      className={cn(
        'w-full cursor-grab rounded-[var(--radius-lg)] border p-3 text-left transition-all',
        'hover:border-edge-hover hover:bg-surface-elevated/50',
        needsInput
          ? 'border-amber-500/40 bg-amber-500/5 shadow-[0_0_12px_rgba(245,158,11,0.08)]'
          : 'border-edge bg-surface-raised',
        isDragging && 'opacity-30',
        isDragOverlay && 'shadow-lg ring-2 ring-accent/50 cursor-grabbing',
      )}
    >
      {/* Top row: priority + type + assignee avatar (top-right) */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PriorityBadge priority={epic.priority} />
          <Badge className={cn('text-[10px]', typeColors[epic.type])}>
            {epic.type}
          </Badge>
        </div>
        {assignee && (
          <div
            className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0"
            style={{ backgroundColor: assignee.color }}
            title={assignee.name}
          >
            {assignee.initials}
          </div>
        )}
      </div>

      {/* Title */}
      <p className="mt-2 truncate text-sm font-medium text-ink">
        {epic.title}
      </p>

      {/* Progress bar */}
      <div className="mt-2.5">
        <div className="h-1.5 rounded-full bg-surface-elevated">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="mt-1 text-xs text-ink-muted">
          {epic.beadProgress.done}/{epic.beadProgress.total} beads
        </p>
      </div>

      {/* Agent status */}
      {epic.agentStatus && (
        <div className={cn(
          'mt-2 flex items-center gap-1.5',
          needsInput && 'rounded-[var(--radius-sm)] bg-amber-500/10 px-2 py-1 -mx-1',
        )}>
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full animate-pulse',
              epic.agentStatus === 'running' ? 'bg-green-400' : 'bg-amber-400',
            )}
          />
          <span className={cn(
            'text-xs',
            needsInput ? 'text-amber-400 font-medium' : 'text-ink-secondary',
          )}>
            {epic.agentStatus === 'running' ? 'running' : 'needs input'}
          </span>
        </div>
      )}

      {/* PR link */}
      {epic.uiStatus === 'in_review' && epic.prNumber && (
        <div className="mt-2 flex items-center gap-1 text-xs text-accent">
          <span>PR #{epic.prNumber}</span>
          <ExternalLink className="h-3 w-3" />
        </div>
      )}

      {/* Bottom row: time + labels */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-ink-muted">
          {formatDistanceToNow(epic.updatedAt * 1000, { addSuffix: true })}
        </span>
        <div className="flex gap-1">
          {epic.labels.slice(0, 2).map((label) => (
            <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0">
              {label}
            </Badge>
          ))}
        </div>
      </div>
    </button>
  )
}
