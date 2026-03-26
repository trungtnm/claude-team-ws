import { useState, useMemo, useCallback } from 'react'
import { Plus, Loader2 } from 'lucide-react'
import { DndContext, DragOverlay, closestCorners, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/components/board/filter-bar'
import { BoardColumn } from '@/components/board/board-column'
import { EpicCard } from '@/components/board/epic-card'
import { EpicDetailSheet } from '@/components/board/epic-detail-sheet'
import { EpicCreateDialog } from '@/components/board/epic-create-dialog'
import { useBoardStore } from '@/stores/board-store'
import { useEpics, useUpdateEpic } from '@/hooks/use-epics'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { useProject } from '@/providers/project-provider'
import { boardColumns as columns } from '@/types'
import type { BoardEpic, UiStatus } from '@/types'

export function BoardPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [activeEpic, setActiveEpic] = useState<BoardEpic | null>(null)
  const { filterType, filterLabel, searchQuery } = useBoardStore()
  const { data: epics = [], isLoading } = useEpics()
  const updateEpic = useUpdateEpic()
  const queryClient = useQueryClient()
  const { projectId } = useProject()

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

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const epic = event.active.data.current?.epic as BoardEpic | undefined
    if (epic) setActiveEpic(epic)
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveEpic(null)

      const { active, over } = event
      if (!over) return

      const epic = active.data.current?.epic as BoardEpic | undefined
      if (!epic) return

      const newStatus = over.id as UiStatus
      if (epic.uiStatus === newStatus) return

      // Optimistic update: patch the query cache immediately
      queryClient.setQueryData<BoardEpic[]>(
        queryKeys.epics.list(projectId),
        (prev) =>
          prev?.map((e) =>
            e.id === epic.id ? { ...e, uiStatus: newStatus } : e,
          ),
      )

      // Fire the mutation; on error TanStack Query will refetch
      updateEpic.mutate(
        { epicId: epic.id, uiStatus: newStatus },
        {
          onError: () => {
            // Rollback: invalidate to refetch server state
            queryClient.invalidateQueries({
              queryKey: queryKeys.epics.all(projectId),
            })
          },
        },
      )
    },
    [queryClient, projectId, updateEpic],
  )

  const handleDragCancel = useCallback(() => {
    setActiveEpic(null)
  }, [])

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

      {/* Board columns with drag-and-drop */}
      <DndContext
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
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
        <DragOverlay dropAnimation={null}>
          {activeEpic ? (
            <div className="w-[240px]">
              <EpicCard epic={activeEpic} isDragOverlay />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Overlays */}
      <EpicDetailSheet />
      <EpicCreateDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
  )
}
