import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Inbox, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CaptureCard } from '@/components/capture/capture-card'
import { TriageDialog } from '@/components/capture/triage-dialog'
import { useCaptureStore } from '@/stores/capture-store'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Capture } from '@/data/captures'

type FilterTab = 'pending' | 'deferred' | 'all'

export function CapturesPage() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const [activeTab, setActiveTab] = useState<FilterTab>('pending')
  const [triageCaptures, setTriageCaptures] = useState<Capture[]>([])
  // Keep legacy single-capture handler for card-level triage button
  const [triageCapture, setTriageCapture] = useState<Capture | null>(null)

  const {
    captures,
    selectedIds,
    toggleSelected,
    selectAll,
    clearSelection,
    updateStatus,
    dismissCapture,
    openComposer,
  } = useCaptureStore()

  const pendingCaptures = useMemo(
    () => captures.filter((c) => c.status === 'pending'),
    [captures],
  )
  const deferredCaptures = useMemo(
    () => captures.filter((c) => c.status === 'deferred'),
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
      case 'all':
        return allCaptures
    }
  }, [activeTab, pendingCaptures, deferredCaptures, allCaptures])

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
        updateStatus(id, 'triaged')
      }
      clearSelection()
    },
    [updateStatus, clearSelection],
  )

  const handleTriaged = useCallback(
    (captureId: string) => {
      updateStatus(captureId, 'triaged')
    },
    [updateStatus],
  )

  // Keep for backward compat but unused now
  const _handleTriageNext = useCallback(
    (captureId: string) => {
      updateStatus(captureId, 'triaged')
      const remaining = pendingCaptures.filter((c) => c.id !== captureId)
      if (remaining.length > 0) {
        setTriageCapture(remaining[0])
      } else {
        setTriageCapture(null)
      }
    },
    [updateStatus, pendingCaptures],
  )

  const handleDefer = useCallback(
    (id: string) => {
      updateStatus(id, 'deferred')
      toast('Capture deferred')
    },
    [updateStatus],
  )

  const handleDismiss = useCallback(
    (id: string) => {
      dismissCapture(id)
      toast('Capture dismissed')
    },
    [dismissCapture],
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

  const handleBatchDefer = useCallback(() => {
    for (const id of selectedIds) {
      updateStatus(id, 'deferred')
    }
    clearSelection()
    toast(`${selectedCount} captures deferred`)
  }, [selectedIds, selectedCount, updateStatus, clearSelection])

  const handleBatchDismiss = useCallback(() => {
    for (const id of selectedIds) {
      dismissCapture(id)
    }
    clearSelection()
    toast(`${selectedCount} captures dismissed`)
  }, [selectedIds, selectedCount, dismissCapture, clearSelection])

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
    { value: 'all', label: 'All', count: allCaptures.length },
  ]

  // Suppress unused variable warnings
  void triageCapture
  void _handleTriageNext
  void handleTriaged

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
        {displayedCaptures.length === 0 ? (
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
                onTriage={handleTriage}
                onDefer={handleDefer}
                onDismiss={handleDismiss}
                selected={selectedIds.has(capture.id)}
                onToggleSelect={toggleSelected}
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
