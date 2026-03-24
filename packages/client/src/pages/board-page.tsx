import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Search, Bot, Play, GitBranch, AlertCircle, LayoutDashboard } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useEpicsQuery, useEpicSocket, type Epic } from '@/hooks/use-epics'
import { useSocketRoom } from '@/hooks/use-socket'
import { cn } from '@/lib/utils'

const COLUMNS = [
  { id: 'blocked', label: 'Blocked', dot: 'bg-red-400', color: 'text-red-400' },
  { id: 'ready', label: 'Ready', dot: 'bg-blue-400', color: 'text-blue-400' },
  { id: 'in_progress', label: 'In Progress', dot: 'bg-green-400', color: 'text-green-400' },
  { id: 'in_review', label: 'In Review', dot: 'bg-amber-400', color: 'text-amber-400' },
  { id: 'done', label: 'Done', dot: 'bg-emerald-400', color: 'text-emerald-400' },
] as const

const priorityConfig: Record<number, { label: string; color: string }> = {
  0: { label: 'P0', color: 'text-p0 bg-p0/15' },
  1: { label: 'P1', color: 'text-p1 bg-p1/15' },
  2: { label: 'P2', color: 'text-p2 bg-p2/15' },
  3: { label: 'P3', color: 'text-p3 bg-p3/15' },
}

export default function BoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')

  useSocketRoom(projectId ? `project:${projectId}` : undefined)
  useEpicSocket(projectId!)

  const { data: epics = [], isLoading, isError } = useEpicsQuery(projectId!)

  const filteredEpics = useMemo(() => {
    if (!searchQuery.trim()) return epics
    const q = searchQuery.toLowerCase()
    return epics.filter((e) =>
      e.bead?.title?.toLowerCase().includes(q) ||
      e.bead_epic_id.toLowerCase().includes(q),
    )
  }, [epics, searchQuery])

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="relative h-6 w-6">
          <div className="absolute inset-0 rounded-full border-2 border-edge" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <AlertCircle className="h-10 w-10 text-error" />
        <p className="text-sm text-ink-secondary">Failed to load epics</p>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  if (epics.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <LayoutDashboard className="h-12 w-12 text-ink-disabled" />
        <p className="text-sm text-ink-muted">No epics yet</p>
        <p className="text-xs text-ink-disabled">Capture ideas and triage them into epics to get started</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-ink">Epic Board</h1>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
            <Input
              placeholder="Search epics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-64 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="text-xs text-ink-muted">
          {epics.length} epics
        </div>
      </div>

      {/* Board columns */}
      <div className="grid flex-1 grid-cols-5 gap-4 overflow-x-auto min-h-0">
        {COLUMNS.map((column) => {
          const columnEpics = filteredEpics.filter((e) => e.ui_status === column.id)
          return (
            <div key={column.id} className="flex flex-col min-h-0">
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3 px-0.5">
                <span className={cn('h-2 w-2 rounded-full shrink-0', column.dot)} />
                <span className="text-xs font-medium text-ink-secondary uppercase tracking-wider">
                  {column.label}
                </span>
                <span className="text-[10px] text-ink-disabled tabular-nums">
                  {columnEpics.length}
                </span>
              </div>

              {/* Column cards */}
              <ScrollArea className="flex-1">
                <div className="space-y-2 pr-1">
                  {columnEpics.length === 0 ? (
                    <div className="rounded-[var(--radius-md)] border border-dashed border-edge p-4 text-center">
                      <p className="text-xs text-ink-disabled">No epics</p>
                    </div>
                  ) : (
                    columnEpics.map((epic) => (
                      <EpicCard
                        key={epic.id}
                        epic={epic}
                        onStartSession={() => navigate(`/projects/${projectId}/agents`)}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EpicCard({ epic, onStartSession }: { epic: Epic; onStartSession: () => void }) {
  const bead = epic.bead
  const priority = bead?.priority ?? 2
  const pConfig = priorityConfig[priority] ?? priorityConfig[2]
  let branches: { repo: string; branch: string }[] = []
  try { branches = JSON.parse(epic.git_branches || '[]') } catch { /* malformed JSON */ }

  return (
    <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-3 hover:border-edge-hover hover:shadow-[var(--shadow-card)] transition-all cursor-pointer group">
      {/* Top: Priority + title */}
      <div className="flex items-start gap-2">
        <Badge className={cn('text-[9px] shrink-0', pConfig.color)}>
          {pConfig.label}
        </Badge>
        <span className="text-sm font-medium text-ink line-clamp-2">
          {bead?.title ?? epic.bead_epic_id}
        </span>
      </div>

      {/* Labels */}
      {bead?.labels && bead.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {bead.labels.map((label) => (
            <Badge key={label} variant="outline" className="text-[9px]">
              {label}
            </Badge>
          ))}
        </div>
      )}

      {/* Branches */}
      {branches.length > 0 && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-ink-disabled">
          <GitBranch className="h-3 w-3" />
          <span className="truncate">{branches[0].branch}</span>
        </div>
      )}

      {/* Actions */}
      {epic.ui_status === 'ready' && (
        <div className="mt-2">
          <Button size="sm" className="w-full text-xs h-7 gap-1" onClick={onStartSession}>
            <Play className="h-3 w-3" />
            Start Session
          </Button>
        </div>
      )}

      {epic.ui_status === 'blocked' && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-ink-disabled">
          <AlertCircle className="h-3 w-3 text-red-400" />
          <span>Blocked by dependencies</span>
        </div>
      )}

      {epic.ui_status === 'in_progress' && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-green-400">
          <Bot className="h-3 w-3 animate-pulse" />
          <span>Agent running</span>
        </div>
      )}

      {epic.ui_status === 'in_review' && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Awaiting review</span>
        </div>
      )}

      {/* Bead ID */}
      <p className="mt-2 text-[9px] text-ink-disabled font-mono">{epic.bead_epic_id}</p>
    </div>
  )
}
