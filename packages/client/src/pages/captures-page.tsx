import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Inbox, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CaptureCard } from '@/components/capture/capture-card'
import { TriageDialog } from '@/components/capture/triage-dialog'
import { useCaptureStore } from '@/stores/capture-store'
import { useCapturesQuery, useUpdateCaptureMutation, useDeleteCaptureMutation } from '@/hooks/use-captures'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Capture } from '@/types'

type FilterTab = 'pending' | 'deferred' | 'completed' | 'all'

export function CapturesPage() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')
  const [triageCaptures, setTriageCaptures] = useState<Capture[]>([])

  const {
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    openComposer,
  } = useCaptureStore()

  // Fetch captures from server
  const { data: captures = [], isLoading, error } = useCapturesQuery()
  const updateMutation = useUpdateCaptureMutation()
  const deleteMutation = useDeleteCaptureMutation()

  const pendingCaptures = useMemo(
    () => captures.filter((c) => c.status === 'pending'),
    [captures],
  )
  const deferredCaptures = useMemo(
    () => captures.filter((c) => c.status === 'deferred'),
    [captures],
  )
  const completedCaptures = useMemo(
    () => captures.filter((c) => c.status === 'triaged'),
    [captures],
  )
  const allCaptures = useMemo(
    () => captures.filter((c) => c.status !== 'dismissed'),
    [captures],
  )

  const displayedCaptures = useMemo(() => {
    switch (activeTab) {
      case 'pending':
        return pendingCaptures
      case 'deferred':
        return deferredCaptures
      case 'completed':
        return completedCaptures
      case 'all':
        return allCaptures
    }
  }, [activeTab, pendingCaptures, deferredCaptures, completedCaptures, allCaptures])

  // Clear selection when switching tabs
  useEffect(() => {
    clearSelection()
  }, [activeTab, clearSelection])

  const handleTriage = useCallback((capture: Capture) => {
    setTriageCaptures([capture])
  }, [])

  const handleTriagedMultiple = useCallback(
    (captureIds: string[]) => {
      for (const id of captureIds) {
        updateMutation.mutate({ captureId: id, status: 'triaged' })
      }
      clearSelection()
    },
    [updateMutation, clearSelection],
  )

  const handleDefer = useCallback(
    (id: string) => {
      updateMutation.mutate(
        { captureId: id, status: 'deferred' },
        { onSuccess: () => toast('Capture deferred') },
      )
    },
    [updateMutation],
  )

  const handleDismiss = useCallback(
    (id: string) => {
      updateMutation.mutate(
        { captureId: id, status: 'dismissed' },
        { onSuccess: () => toast('Capture dismissed') },
      )
    },
    [updateMutation],
  )

  // Batch operations
  const selectedCount = selectedIds.size
  const hasSelection = selectedCount > 0

  const handleBatchTriage = useCallback(() => {
    const selected = captures.filter((c) => selectedIds.has(c.id) && c.status === 'pending')
    if (selected.length > 0) {
      setTriageCaptures(selected)
    }
  }, [captures, selectedIds])

  const handleBatchDefer = useCallback(async () => {
    const ids = [...selectedIds]
    clearSelection()
    try {
      await Promise.all(
        ids.map((id) => updateMutation.mutateAsync({ captureId: id, status: 'deferred' })),
      )
      toast(`${ids.length} captures deferred`)
    } catch {
      toast.error('Some captures could not be deferred')
    }
  }, [selectedIds, updateMutation, clearSelection])

  const handleBatchDismiss = useCallback(async () => {
    const ids = [...selectedIds]
    clearSelection()
    try {
      await Promise.all(ids.map((id) => deleteMutation.mutateAsync(id)))
      toast(`${ids.length} captures dismissed`)
    } catch {
      toast.error('Some captures could not be dismissed')
    }
  }, [selectedIds, deleteMutation, clearSelection])

  const handleSelectAll = useCallback(() => {
    if (selectedCount === displayedCaptures.length) {
      clearSelection()
    } else {
      selectAll(displayedCaptures.map((c) => c.id))
    }
  }, [selectedCount, displayedCaptures, selectAll, clearSelection])

  const tabs: { value: FilterTab; label: string; count: number }[] = [
    { value: 'pending', label: 'Pending', count: pendingCaptures.length },
    { value: 'deferred', label: 'Deferred', count: deferredCaptures.length },
    { value: 'completed', label: 'Completed', count: completedCaptures.length },
    { value: 'all', label: 'All', count: allCaptures.length },
  ]

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm" style={{ color: 'var(--error)' }}>Failed to load data</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(error as Error).message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-ink">Captures</h1>
          <div className="flex items-center gap-2">
            <Badge variant="accent" className="text-xs">
              {pendingCaptures.length} pending
            </Badge>
            {deferredCaptures.length > 0 && (
              <Badge variant="default" className="text-xs">
                {deferredCaptures.length} deferred
              </Badge>
            )}
          </div>
        </div>
        <Button className="gap-2" onClick={openComposer}>
          <Plus className="h-4 w-4" />
          Capture
        </Button>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-4">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'rounded-[var(--radius-md)] px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              activeTab === tab.value
                ? 'bg-surface-elevated text-ink'
                : 'text-ink-muted hover:text-ink-secondary hover:bg-surface-raised',
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-ink-disabled">({tab.count})</span>
          </button>
        ))}

        {displayedCaptures.length > 0 && (
          <button
            type="button"
            onClick={handleSelectAll}
            className="ml-auto text-xs text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer"
          >
            {selectedCount === displayedCaptures.length ? 'Deselect all' : 'Select all'}
          </button>
        )}
      </div>

      {/* Captures list */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
          </div>
        ) : displayedCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Inbox className="h-12 w-12 text-ink-disabled mb-4" />
            <h3 className="text-lg font-medium text-ink-secondary mb-1">All caught up</h3>
            <p className="text-sm text-ink-muted">
              {"Your team's ideas will appear here"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {displayedCaptures.map((capture) => (
              <CaptureCard
                key={capture.id}
                capture={capture}
                onTriage={activeTab !== 'completed' ? handleTriage : undefined}
                onDefer={activeTab !== 'completed' ? handleDefer : undefined}
                onDismiss={activeTab !== 'completed' ? handleDismiss : undefined}
                selected={selectedIds.has(capture.id)}
                onToggleSelect={activeTab !== 'completed' ? toggleSelected : undefined}
                highlighted={capture.id === highlightId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Batch actions bar */}
      {hasSelection && (
        <div
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-lg)] p-3 mt-3',
            'bg-surface-overlay border border-edge',
            'animate-[composer-in_150ms_ease-out]',
          )}
        >
          <span className="text-sm font-medium text-ink">
            {selectedCount} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" onClick={handleBatchTriage}>
              Triage All
            </Button>
            <Button size="sm" variant="secondary" onClick={handleBatchDefer}>
              Defer All
            </Button>
            <Button size="sm" variant="ghost" onClick={handleBatchDismiss}>
              Dismiss All
            </Button>
          </div>
        </div>
      )}

      {/* Triage dialog — shows selected captures for review, then AI triage */}
      {triageCaptures.length > 0 && (
        <TriageDialog
          captures={triageCaptures}
          open={triageCaptures.length > 0}
          onOpenChange={(open) => {
            if (!open) setTriageCaptures([])
          }}
          onTriaged={handleTriagedMultiple}
        />
      )}
    </div>
  )
}

export default CapturesPage
