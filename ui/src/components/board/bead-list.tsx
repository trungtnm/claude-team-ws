import { useState } from 'react'
import { CheckCircle2, Circle, Loader2, Ban, ChevronDown, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getBeadsByEpicId, type Bead, type BeadStatus } from '@/data/beads'
import { getBeadById } from '@/data/beads'
import { getUserById } from '@/data/users'
import { BeadDetailDialog } from '@/components/board/bead-detail-dialog'

const statusOrder: BeadStatus[] = ['in_progress', 'blocked', 'open', 'done']

const statusIcons: Record<BeadStatus, { icon: typeof Circle; className: string }> = {
  done: { icon: CheckCircle2, className: 'text-green-400' },
  open: { icon: Circle, className: 'text-ink-muted' },
  in_progress: { icon: Loader2, className: 'text-blue-400 animate-spin' },
  blocked: { icon: Ban, className: 'text-red-400' },
}

const priorityColors: Record<number, string> = {
  0: 'bg-red-500/15 text-red-400',
  1: 'bg-blue-500/15 text-blue-400',
  2: 'bg-yellow-500/15 text-yellow-400',
  3: 'bg-gray-500/15 text-gray-400',
}

interface BeadListProps {
  epicId: string
}

export function BeadList({ epicId }: BeadListProps) {
  const [selectedBead, setSelectedBead] = useState<Bead | null>(null)
  const [doneCollapsed, setDoneCollapsed] = useState(true)

  const allBeads = getBeadsByEpicId(epicId)

  const grouped = statusOrder.reduce<Record<BeadStatus, Bead[]>>(
    (acc, status) => {
      acc[status] = allBeads.filter((b) => b.status === status)
      return acc
    },
    { open: [], in_progress: [], done: [], blocked: [] },
  )

  const activeBeads = [...grouped.in_progress, ...grouped.blocked, ...grouped.open]
  const doneBeads = grouped.done

  if (allBeads.length === 0) {
    return (
      <p className="text-sm text-ink-muted">No beads for this epic yet.</p>
    )
  }

  return (
    <>
      <div className="space-y-1">
        {activeBeads.map((bead) => (
          <BeadRow key={bead.id} bead={bead} onClick={() => setSelectedBead(bead)} />
        ))}

        {doneBeads.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setDoneCollapsed(!doneCollapsed)}
              className="flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1 py-1 text-xs text-ink-muted hover:text-ink-secondary transition-colors"
            >
              {doneCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              <span>Completed ({doneBeads.length})</span>
            </button>
            {!doneCollapsed && (
              <div className="space-y-1 mt-1">
                {doneBeads.map((bead) => (
                  <BeadRow key={bead.id} bead={bead} onClick={() => setSelectedBead(bead)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <BeadDetailDialog
        bead={selectedBead}
        open={selectedBead !== null}
        onOpenChange={(open) => !open && setSelectedBead(null)}
      />
    </>
  )
}

function BeadRow({ bead, onClick }: { bead: Bead; onClick: () => void }) {
  const config = statusIcons[bead.status]
  const Icon = config.icon
  const assignee = bead.assigneeId ? getUserById(bead.assigneeId) : undefined

  const blockerTitle =
    bead.status === 'blocked' && bead.dependencies.length > 0
      ? bead.dependencies
          .map((depId) => {
            const dep = getBeadById(depId)
            return dep ? dep.title : depId
          })
          .join(', ')
      : null

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors',
        'hover:bg-surface-elevated/60',
        bead.status === 'done' && 'opacity-60',
      )}
    >
      <Icon className={cn('h-4 w-4 shrink-0', config.className)} />
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'text-sm',
            bead.status === 'done' ? 'text-ink-muted line-through' : 'text-ink',
          )}
        >
          {bead.title}
        </span>
        {blockerTitle && (
          <p className="text-[11px] text-red-400/80 mt-0.5 truncate">
            Blocked by: {blockerTitle}
          </p>
        )}
      </div>
      <Badge className={cn('text-[10px] shrink-0', priorityColors[bead.priority] || priorityColors[3])}>
        P{bead.priority}
      </Badge>
      {assignee && (
        <div
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
          style={{ backgroundColor: assignee.color }}
          title={assignee.name}
        >
          {assignee.initials}
        </div>
      )}
    </button>
  )
}
