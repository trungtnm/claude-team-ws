import {
  ExternalLink, GitBranch, X, Clock, CalendarClock,
  Tag, UserPlus, Timer,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PriorityBadge } from '@/components/board/priority-badge'
import { users } from '@/data/users'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Epic, Priority } from '@/data/epics'
import type { User } from '@/data/users'

const typeColors: Record<string, string> = {
  feature: 'text-blue-400 bg-blue-400/10',
  bug: 'text-red-400 bg-red-400/10',
  task: 'text-green-400 bg-green-400/10',
  docs: 'text-purple-400 bg-purple-400/10',
}

const uiStatusConfig: Record<string, { className: string; label: string }> = {
  blocked: { className: 'bg-red-500/15 text-red-400', label: 'Blocked' },
  ready: { className: 'bg-blue-500/15 text-blue-400', label: 'Ready' },
  in_progress: { className: 'bg-amber-500/15 text-amber-400', label: 'In Progress' },
  in_review: { className: 'bg-purple-500/15 text-purple-400', label: 'In Review' },
  done: { className: 'bg-green-500/15 text-green-400', label: 'Done' },
  cancelled: { className: 'bg-red-500/15 text-red-400', label: 'Cancelled' },
}

const sessionStatusColors: Record<string, string> = {
  running: 'bg-green-400', waiting_input: 'bg-amber-400', queued: 'bg-gray-400',
  completed: 'bg-blue-400', failed: 'bg-red-400', cancelled: 'bg-gray-400',
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function formatTimestamp(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export interface EpicSidebarSession {
  id: string
  status: string
  name: string
  duration: number
}

interface EpicSidebarMetaProps {
  epic: Epic
  // Local state values
  localStatus: string
  localPriority: Priority
  localType: string
  localAssignee: User | undefined
  localAssigneeId: string
  localLabels: string[]
  localDueDate: string
  localEstimate: string
  labelInput: string
  showDueDateInput: boolean
  showEstimateInput: boolean
  // Handlers
  onStatusChange: (status: string) => void
  onPriorityChange: (idx: number) => void
  onTypeChange: (type: string) => void
  onAssigneeChange: (userId: string) => void
  onAddLabel: () => void
  onRemoveLabel: (label: string) => void
  onSetEstimate: () => void
  onLabelInputChange: (value: string) => void
  onDueDateChange: (value: string) => void
  onEstimateChange: (value: string) => void
  onShowDueDateInput: (show: boolean) => void
  onShowEstimateInput: (show: boolean) => void
  onViewPR: () => void
  onViewSession: (sessionId: string) => void
  // Data
  sessions: EpicSidebarSession[]
}

export function EpicSidebarMeta({
  epic,
  localStatus, localPriority, localType, localAssignee, localAssigneeId,
  localLabels, localDueDate, localEstimate, labelInput,
  showDueDateInput, showEstimateInput,
  onStatusChange, onPriorityChange, onTypeChange, onAssigneeChange,
  onAddLabel, onRemoveLabel, onSetEstimate,
  onLabelInputChange, onDueDateChange, onEstimateChange,
  onShowDueDateInput, onShowEstimateInput,
  onViewPR, onViewSession,
  sessions,
}: EpicSidebarMetaProps) {
  return (
    <div className="w-64 shrink-0 border-l border-edge bg-surface-base overflow-y-auto p-4 space-y-4">
      {/* Status */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Status</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="cursor-pointer"><Badge className={cn(uiStatusConfig[localStatus]?.className, 'cursor-pointer')}>{uiStatusConfig[localStatus]?.label}</Badge></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Change status</DropdownMenuLabel>
            {Object.entries(uiStatusConfig).map(([key, cfg]) => (
              <DropdownMenuItem key={key} onClick={() => onStatusChange(cfg.label)}>
                <span className={cn('inline-block h-2 w-2 rounded-full mr-2', cfg.className.split(' ')[0])} />
                {cfg.label}
                {key === localStatus && <span className="ml-auto text-[10px] text-accent">current</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Priority */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Priority</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="cursor-pointer"><PriorityBadge priority={localPriority} /></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Change priority</DropdownMenuLabel>
            {['P0 — Critical', 'P1 — High', 'P2 — Medium', 'P3 — Low'].map((label, i) => (
              <DropdownMenuItem key={i} onClick={() => onPriorityChange(i)}>
                {label}
                {i === localPriority && <span className="ml-auto text-[10px] text-accent">current</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Type */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Type</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="cursor-pointer"><Badge className={cn('text-[11px] cursor-pointer', typeColors[localType])}>{localType}</Badge></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Change type</DropdownMenuLabel>
            {Object.entries(typeColors).map(([t, colors]) => (
              <DropdownMenuItem key={t} onClick={() => onTypeChange(t)}>
                <span className={cn('inline-block h-2 w-2 rounded-full mr-2', colors.split(' ')[0])} />
                {t}
                {t === localType && <span className="ml-auto text-[10px] text-accent">current</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Assignee */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Assignee</h4>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              {localAssignee ? (<><div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: localAssignee.color }}>{localAssignee.initials}</div><span className="text-sm text-ink">{localAssignee.name}</span></>) : (<span className="flex items-center gap-1.5 text-sm text-ink-muted"><UserPlus className="h-3.5 w-3.5" /> Assign</span>)}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Assign to</DropdownMenuLabel>
            {users.map((u) => (
              <DropdownMenuItem key={u.id} onClick={() => onAssigneeChange(u.id)}>
                <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white mr-2" style={{ backgroundColor: u.color }}>{u.initials}</div>
                {u.name}
                {u.id === localAssigneeId && <span className="ml-auto text-[10px] text-accent">current</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onAssigneeChange('')}><X className="h-3.5 w-3.5 mr-2 text-ink-muted" /> Unassign</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Labels */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Labels</h4>
        <div className="flex flex-wrap gap-1 mb-1.5">
          {localLabels.map((label) => (
            <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0 gap-1 group cursor-pointer" onClick={() => onRemoveLabel(label)}>
              {label}
              <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted" />
            </Badge>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <Input
            value={labelInput}
            onChange={(e) => onLabelInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onAddLabel() } }}
            placeholder="Add label..."
            className="h-6 text-[10px] flex-1"
          />
          <button type="button" onClick={onAddLabel} className="shrink-0 rounded-[var(--radius-sm)] p-1 text-ink-disabled hover:text-ink-muted transition-colors cursor-pointer">
            <Tag className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Due date */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Due date</h4>
        {showDueDateInput || localDueDate ? (
          <div className="flex items-center gap-1">
            <Input type="date" value={localDueDate} onChange={(e) => onDueDateChange(e.target.value)} className="h-7 text-xs flex-1" autoFocus={showDueDateInput && !localDueDate} />
            {localDueDate && (
              <button type="button" onClick={() => { onDueDateChange(''); onShowDueDateInput(false); toast('Due date cleared') }} className="shrink-0 p-1 text-ink-disabled hover:text-error transition-colors cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => onShowDueDateInput(true)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer">
            <CalendarClock className="h-3.5 w-3.5" /> Set due date
          </button>
        )}
      </div>

      {/* Estimate */}
      <div>
        <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Estimate</h4>
        {showEstimateInput || localEstimate ? (
          <div className="flex items-center gap-1">
            <Input value={localEstimate} onChange={(e) => onEstimateChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onSetEstimate() }} placeholder="e.g., 4h, 2d, 1w" className="h-7 text-xs flex-1" autoFocus={showEstimateInput && !localEstimate} />
            {localEstimate && (
              <button type="button" onClick={() => { onEstimateChange(''); onShowEstimateInput(false); toast('Estimate cleared') }} className="shrink-0 p-1 text-ink-disabled hover:text-error transition-colors cursor-pointer">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => onShowEstimateInput(true)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer">
            <Timer className="h-3.5 w-3.5" /> Set estimate
          </button>
        )}
      </div>

      <Separator />

      {epic.gitBranch && (<div><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Branch</h4><div className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5 text-ink-muted" /><code className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] text-ink-secondary">{epic.gitBranch}</code></div></div>)}

      {epic.prUrl && epic.prNumber && (<div><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Pull Request</h4><button onClick={onViewPR} className="flex items-center gap-1.5 text-sm text-accent hover:underline cursor-pointer"><ExternalLink className="h-3.5 w-3.5" /> PR #{epic.prNumber}</button>{epic.prStatus && <Badge variant="outline" className="text-[10px] mt-1">{epic.prStatus.replace(/_/g, ' ')}</Badge>}</div>)}

      {sessions.length > 0 && (<div><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Sessions</h4><div className="space-y-2">{sessions.map((s) => (<button key={s.id} onClick={() => onViewSession(s.id)} className="w-full rounded-[var(--radius-md)] border border-edge bg-surface-raised p-2 text-left hover:bg-surface-elevated transition-colors cursor-pointer"><div className="flex items-center gap-1.5"><span className={cn('inline-block h-2 w-2 rounded-full', sessionStatusColors[s.status] ?? 'bg-gray-400', (s.status === 'running' || s.status === 'waiting_input') && 'animate-pulse')} /><span className="text-xs font-medium text-ink truncate">{s.name || 'Queued'}</span></div><div className="mt-1 flex items-center gap-2 text-[10px] text-ink-muted"><span>{s.status.replace('_', ' ')}</span><span>{formatDuration(s.duration)}</span></div></button>))}</div></div>)}

      <div className="space-y-1">
        <div className="flex items-center gap-1.5 text-[10px] text-ink-muted"><Clock className="h-3 w-3" /> Created {formatTimestamp(epic.createdAt)}</div>
        <div className="flex items-center gap-1.5 text-[10px] text-ink-muted"><Clock className="h-3 w-3" /> Updated {formatTimestamp(epic.updatedAt)}</div>
      </div>
    </div>
  )
}
