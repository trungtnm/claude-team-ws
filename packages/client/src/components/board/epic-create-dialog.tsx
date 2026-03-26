import { useState, useMemo } from 'react'
import { CheckCircle2, Search, Zap, Inbox } from 'lucide-react'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { TriageDialog } from '@/components/capture/triage-dialog'
import { useCapturesQuery, useUpdateCaptureMutation } from '@/hooks/use-captures'
import { cn } from '@/lib/utils'
import type { Capture } from '@/types'

interface EpicCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function EpicCreateDialog({ open, onOpenChange }: EpicCreateDialogProps) {
  const { data: captures = [] } = useCapturesQuery('pending')
  const updateMutation = useUpdateCaptureMutation()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showTriage, setShowTriage] = useState(false)

  const pendingCaptures = captures

  const filteredCaptures = useMemo(() => {
    if (!searchQuery.trim()) return pendingCaptures
    const q = searchQuery.toLowerCase()
    return pendingCaptures.filter((c) => c.text.toLowerCase().includes(q))
  }, [pendingCaptures, searchQuery])

  const toggleCapture = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === filteredCaptures.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredCaptures.map((c) => c.id)))
    }
  }

  const handleStartTriage = () => {
    if (selectedIds.size === 0) {
      toast.error('Select at least one capture to triage')
      return
    }
    setShowTriage(true)
    onOpenChange(false)
  }

  const handleTriaged = (captureIds: string[]) => {
    for (const id of captureIds) {
      updateMutation.mutate({ captureId: id, status: 'triaged' })
    }
    setSelectedIds(new Set())
    setSearchQuery('')
    setShowTriage(false)
  }

  const selectedCaptures = useMemo(
    () => captures.filter((c) => selectedIds.has(c.id)),
    [captures, selectedIds],
  )

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Create Epic</DialogTitle>
            <DialogDescription>
              Select captures to include, then start the AI-powered triage to generate a structured Epic with Beads.
            </DialogDescription>
          </DialogHeader>

          {/* Search + select all */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search captures..."
                className="pl-9 h-8 text-xs"
              />
            </div>
            {filteredCaptures.length > 0 && (
              <button
                type="button"
                onClick={selectAll}
                className="text-xs text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer whitespace-nowrap"
              >
                {selectedIds.size === filteredCaptures.length ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          {/* Capture list */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            {filteredCaptures.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox className="h-10 w-10 text-ink-disabled mb-3" />
                <p className="text-sm text-ink-muted">
                  {searchQuery ? 'No captures match your search' : 'No pending captures'}
                </p>
                <p className="text-xs text-ink-disabled mt-1">
                  Capture ideas first using the Capture button in the header
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {filteredCaptures.map((capture) => (
                  <CaptureSelectRow
                    key={capture.id}
                    capture={capture}
                    selected={selectedIds.has(capture.id)}
                    onToggle={toggleCapture}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Selected summary */}
          {selectedIds.size > 0 && (
            <>
              <Separator />
              <div className="flex items-center gap-3">
                <Badge variant="accent" className="text-xs">
                  {selectedIds.size} selected
                </Badge>
                <span className="text-xs text-ink-muted">
                  These captures will be analyzed by Claude Code to create a structured Epic
                </span>
              </div>
            </>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleStartTriage}
              disabled={selectedIds.size === 0}
              className="gap-2"
            >
              <Zap className="h-3.5 w-3.5" />
              Start Triage ({selectedIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Triage dialog — same flow as captures page */}
      {showTriage && selectedCaptures.length > 0 && (
        <TriageDialog
          captures={selectedCaptures}
          open={showTriage}
          onOpenChange={(o) => { if (!o) setShowTriage(false) }}
          onTriaged={handleTriaged}
        />
      )}
    </>
  )
}

function CaptureSelectRow({
  capture,
  selected,
  onToggle,
}: {
  capture: Capture
  selected: boolean
  onToggle: (id: string) => void
}) {
  const user = capture.user

  return (
    <button
      type="button"
      onClick={() => onToggle(capture.id)}
      className={cn(
        'flex items-start gap-3 rounded-[var(--radius-lg)] border p-3 text-left transition-all cursor-pointer',
        selected
          ? 'border-accent/40 bg-accent-muted'
          : 'border-edge bg-surface-base hover:bg-surface-elevated hover:border-edge-hover',
      )}
    >
      {/* Checkbox */}
      <div className={cn(
        'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
        selected
          ? 'border-accent bg-accent'
          : 'border-edge',
      )}>
        {selected && <CheckCircle2 className="h-3 w-3 text-surface-base" />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-relaxed', selected ? 'text-ink' : 'text-ink-secondary')}>
          {capture.text}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          {user && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-ink-muted">{user.name}</span>
            </div>
          )}
          <span className="text-[11px] text-ink-disabled">
            {formatDistanceToNow(capture.createdAt * 1000, { addSuffix: true })}
          </span>
        </div>
      </div>
    </button>
  )
}
