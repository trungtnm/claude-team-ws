import { cn } from '@/lib/utils'
import { EpicCard } from '@/components/board/epic-card'
import type { Epic, UiStatus } from '@/data/epics'

interface BoardColumnProps {
  columnId: UiStatus
  label: string
  epics: Epic[]
}

export function BoardColumn({ label, epics }: BoardColumnProps) {
  return (
    <div className="flex min-w-[240px] flex-col rounded-[var(--radius-lg)] border border-edge bg-surface-base/50 p-3">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-ink-secondary">{label}</h3>
        <span className="text-xs text-ink-muted">({epics.length})</span>
      </div>

      {/* Body */}
      <div className={cn('flex flex-1 flex-col gap-2')}>
        {epics.length > 0 ? (
          epics.map((epic) => <EpicCard key={epic.id} epic={epic} />)
        ) : (
          <div className="flex flex-1 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-edge p-6">
            <p className="text-sm text-ink-disabled">No epics</p>
          </div>
        )}
      </div>
    </div>
  )
}
