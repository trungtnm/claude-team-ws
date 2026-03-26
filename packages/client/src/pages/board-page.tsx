import { useState, useMemo } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/components/board/filter-bar'
import { BoardColumn } from '@/components/board/board-column'
import { EpicDetailSheet } from '@/components/board/epic-detail-sheet'
import { EpicCreateDialog } from '@/components/board/epic-create-dialog'
import { useBoardStore } from '@/stores/board-store'
import { useEpics } from '@/hooks/use-epics'
import { boardColumns as columns } from '@/types'

export function BoardPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const { filterType, filterLabel, searchQuery } = useBoardStore()
  const { data: epics = [], isLoading } = useEpics()

  const filteredEpics = useMemo(() => {
    return epics.filter((epic) => {
      if (filterType !== 'all' && epic.type !== filterType) return false
      if (filterLabel !== 'all' && !epic.labels.includes(filterLabel)) return false
      if (
        searchQuery &&
        !epic.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !epic.description.toLowerCase().includes(searchQuery.toLowerCase())
      ) {
        return false
      }
      return true
    })
  }, [epics, filterType, filterLabel, searchQuery])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ink-muted" />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-ink">Epic Board</h1>
          <FilterBar epics={epics} />
        </div>
        <Button className="gap-2" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Epic
        </Button>
      </div>

      {/* Board columns */}
      <div className="grid flex-1 grid-cols-5 gap-4 overflow-x-auto">
        {columns.map((column) => (
          <BoardColumn
            key={column.id}
            columnId={column.id}
            label={column.label}
            epics={filteredEpics.filter((e) => e.uiStatus === column.id)}
          />
        ))}
      </div>

      {/* Overlays */}
      <EpicDetailSheet />
      <EpicCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  )
}
