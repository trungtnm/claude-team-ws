import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ExternalLink, GitBranch, Play, Pencil, X, CheckCircle2, Circle, Clock,
  MessageSquare, Send, CalendarClock, Tag, UserPlus,
  Archive, RotateCcw, Timer, Image, FileText, Film, Inbox,
  Eye, Loader2, GitPullRequest, Ban,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PriorityBadge } from '@/components/board/priority-badge'
import { BeadList } from '@/components/board/bead-list'
import { useBoardStore } from '@/stores/board-store'
import { epics } from '@/data/epics'
import { sessions } from '@/data/sessions'
import { getUserById, users } from '@/data/users'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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

const demoComments = [
  { id: 'c1', author: 'u-2', text: 'Should we include Redis fallback for rate limiting?', createdAt: Date.now() / 1000 - 7200 },
  { id: 'c2', author: 'u-1', text: 'Yes, in-memory fallback if Redis is down. Added as acceptance criteria.', createdAt: Date.now() / 1000 - 3600 },
]

// Simulated dep tree nodes for the Dep Tree tab
const demoDeps = [
  { id: 'ctw-a04', title: 'Rate Limiting Middleware', status: 'ready', depth: 0 },
  { id: 'ctw-b01', title: 'Redis Store Setup', status: 'open', depth: 1 },
  { id: 'ctw-b02', title: 'Limiter Middleware', status: 'open', depth: 1 },
  { id: 'ctw-b03', title: 'Per-endpoint Config', status: 'open', depth: 2 },
  { id: 'ctw-b04', title: 'Integration Tests', status: 'open', depth: 2 },
]

type TabId = 'overview' | 'sources' | 'dep-tree'

function fileIcon(type: string) {
  if (type.startsWith('image/')) return Image
  if (type.startsWith('video/')) return Film
  return FileText
}

export function EpicDetailSheet() {
  const { selectedEpicId, setSelectedEpicId } = useBoardStore()
  const navigate = useNavigate()
  const epic = epics.find((e) => e.id === selectedEpicId)
  const epicSessions = sessions.filter((s) => s.epicId === selectedEpicId)
  // assignee resolved from local state below

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)

  // Local interactive state for sidebar fields
  const [localStatus, setLocalStatus] = useState(epic?.uiStatus ?? 'blocked')
  const [localPriority, setLocalPriority] = useState(epic?.priority ?? 2)
  const [localType, setLocalType] = useState(epic?.type ?? 'feature')
  const [localAssigneeId, setLocalAssigneeId] = useState(epic?.assigneeId ?? '')
  const [localLabels, setLocalLabels] = useState(epic?.labels ?? [])
  const [localDueDate, setLocalDueDate] = useState('')
  const [localEstimate, setLocalEstimate] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [showDueDateInput, setShowDueDateInput] = useState(false)
  const [showEstimateInput, setShowEstimateInput] = useState(false)

  // Reset local state when epic changes
  const epicId = epic?.id
  useState(() => {
    if (epic) {
      setLocalStatus(epic.uiStatus)
      setLocalPriority(epic.priority)
      setLocalType(epic.type)
      setLocalAssigneeId(epic.assigneeId)
      setLocalLabels([...epic.labels])
      setLocalDueDate('')
      setLocalEstimate('')
    }
  })
  void epicId // track dependency

  const localAssignee = getUserById(localAssigneeId)

  const progressPercent = epic && epic.beadProgress.total > 0
    ? (epic.beadProgress.done / epic.beadProgress.total) * 100 : 0
  const checkedIndices = new Set([0, 2])
  const sourceCount = epic?.sourceCaptures?.length ?? 0

  const handleStatusChange = (status: string) => {
    const key = Object.entries(uiStatusConfig).find(([, v]) => v.label === status)?.[0]
    if (key) setLocalStatus(key as typeof localStatus)
    toast.success(`Status → ${status}`)
  }
  const handlePriorityChange = (idx: number) => { setLocalPriority(idx as 0|1|2|3); toast.success(`Priority → P${idx}`) }
  const handleTypeChange = (t: string) => { setLocalType(t as typeof localType); toast.success(`Type → ${t}`) }
  const handleAssigneeChange = (userId: string) => {
    setLocalAssigneeId(userId)
    const u = getUserById(userId)
    toast.success(userId === '' ? 'Unassigned' : `Assigned to ${u?.name}`)
  }
  const handleAddLabel = () => {
    const val = labelInput.trim().toLowerCase()
    if (!val) return
    if (!localLabels.includes(val)) { setLocalLabels([...localLabels, val]); toast.success(`Label "${val}" added`) }
    setLabelInput('')
  }
  const handleRemoveLabel = (label: string) => { setLocalLabels(localLabels.filter((l) => l !== label)); toast('Label removed') }
  const handleSetEstimate = () => { if (localEstimate.trim()) toast.success(`Estimate set to ${localEstimate}`); setShowEstimateInput(false) }
  const handleDefer = () => { setLocalStatus('blocked'); toast.info('Epic deferred') }
  const handleCloseEpic = () => { toast.success('Epic closed'); setSelectedEpicId(null) }
  const handleReopenEpic = () => { setLocalStatus('ready'); toast.success('Epic reopened') }
  const handleAddComment = () => { if (!commentText.trim()) return; toast.success('Comment added'); setCommentText('') }
  const handleStartSession = () => { toast.success('Starting agent session...'); navigate('/agents') }
  const handleViewPR = () => { if (epic?.prNumber) navigate(`/review/${epic.prNumber}`) }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sources', label: 'Source Captures', count: sourceCount },
    { id: 'dep-tree', label: 'Dep Tree' },
  ]

  return (
    <Dialog open={selectedEpicId !== null} onOpenChange={(open) => { if (!open) { setSelectedEpicId(null); setActiveTab('overview') } }}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
        {epic ? (
          <>
            <DialogTitle className="sr-only">{epic.title}</DialogTitle>
            <DialogDescription className="sr-only">Epic details</DialogDescription>

            {/* ── Header bar ── */}
            <div className="px-6 pt-5 pb-0">
              <div className="flex items-center gap-2 mb-2">
                <PriorityBadge priority={epic.priority} />
                <Badge className={cn('text-[10px]', typeColors[epic.type])}>{epic.type}</Badge>
                <code className="text-[10px] text-ink-muted font-mono">{epic.beadId}</code>
              </div>
              <h2 className="text-xl font-semibold text-ink leading-tight">{epic.title}</h2>

              {/* Tabs */}
              <div className="flex items-center gap-1 mt-4 border-b border-edge -mx-6 px-6">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'px-3 py-2 text-sm font-medium transition-colors -mb-px cursor-pointer',
                      activeTab === tab.id
                        ? 'text-accent border-b-2 border-accent'
                        : 'text-ink-muted hover:text-ink-secondary',
                    )}
                  >
                    {tab.label}
                    {tab.count !== undefined && tab.count > 0 && (
                      <span className="ml-1.5 text-[10px] text-ink-disabled">({tab.count})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* ── Left column — tab content ── */}
              <div className="flex-1 overflow-y-auto p-6 space-y-5">

                {/* ═══ OVERVIEW TAB ═══ */}
                {activeTab === 'overview' && (
                  <>
                    <div>
                      <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Description</h4>
                      <p className="text-sm leading-relaxed text-ink-secondary">{epic.description}</p>
                    </div>

                    {epic.acceptanceCriteria && epic.acceptanceCriteria.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">Acceptance Criteria</h4>
                        <ul className="space-y-2">
                          {epic.acceptanceCriteria.map((c, i) => {
                            const done = checkedIndices.has(i)
                            return (
                              <li key={i} className="flex items-start gap-2">
                                {done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />}
                                <span className={cn('text-sm', done ? 'text-ink-muted line-through' : 'text-ink-secondary')}>{c}</span>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}

                    <Separator />

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Beads</h4>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 rounded-full bg-surface-elevated">
                            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${progressPercent}%` }} />
                          </div>
                          <span className="text-xs text-ink-muted">{epic.beadProgress.done}/{epic.beadProgress.total}</span>
                        </div>
                      </div>
                      <BeadList epicId={epic.id} />
                    </div>

                    <Separator />

                    <div>
                      <button type="button" onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer">
                        <MessageSquare className="h-3.5 w-3.5" /> Comments ({demoComments.length})
                      </button>
                      {showComments && (
                        <div className="mt-3 space-y-3 animate-[composer-in_150ms_ease-out]">
                          {demoComments.map((comment) => {
                            const author = getUserById(comment.author)
                            return (
                              <div key={comment.id} className="flex gap-2.5">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white mt-0.5" style={{ backgroundColor: author?.color || '#666' }}>{author?.initials || '?'}</div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-ink">{author?.name}</span>
                                    <span className="text-[10px] text-ink-disabled">{formatDuration(Math.floor(Date.now() / 1000 - comment.createdAt))} ago</span>
                                  </div>
                                  <p className="text-sm text-ink-secondary mt-0.5">{comment.text}</p>
                                </div>
                              </div>
                            )
                          })}
                          <div className="flex items-center gap-2 pt-1">
                            <Input value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment() }} placeholder="Add a comment..." className="h-8 text-xs flex-1" />
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleAddComment} disabled={!commentText.trim()}><Send className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══ SOURCE CAPTURES TAB ═══ */}
                {activeTab === 'sources' && (
                  <>
                    {sourceCount > 0 ? (
                      <div className="space-y-4">
                        <p className="text-xs text-ink-muted">
                          This epic was created from {sourceCount} capture{sourceCount > 1 ? 's' : ''} during triage.
                        </p>
                        {epic.sourceCaptures!.map((cap, i) => (
                          <div key={i} className="rounded-[var(--radius-lg)] border border-edge bg-surface-elevated">
                            {/* Capture header */}
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-edge">
                              <Inbox className="h-3.5 w-3.5 text-accent" />
                              <span className="text-xs font-medium text-ink">{cap.author}</span>
                              <span className="text-[11px] text-ink-disabled">{formatTimestamp(cap.createdAt)}</span>
                            </div>
                            {/* Capture text */}
                            <div className="px-4 py-3">
                              <p className="text-sm text-ink-secondary leading-relaxed">{cap.text}</p>
                            </div>
                            {/* Capture attachments */}
                            {cap.attachments && cap.attachments.length > 0 && (
                              <div className="px-4 pb-3">
                                <div className="flex flex-wrap gap-2">
                                  {cap.attachments.map((att, j) => {
                                    const Icon = fileIcon(att.type)
                                    return att.type.startsWith('image/') ? (
                                      <div key={j} className="group relative rounded-[var(--radius-md)] border border-edge overflow-hidden cursor-pointer hover:border-edge-hover transition-colors">
                                        <img src={att.preview} alt={att.name} className="h-24 w-36 object-cover" />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                                          <span className="w-full px-2 py-1 text-[10px] text-white opacity-0 group-hover:opacity-100 bg-black/50 truncate transition-opacity">{att.name}</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div key={j} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-edge bg-surface-base px-3 py-2 hover:bg-surface-raised transition-colors cursor-pointer">
                                        <Icon className="h-4 w-4 text-ink-muted shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-xs text-ink truncate">{att.name}</p>
                                          <p className="text-[10px] text-ink-disabled">{att.size}</p>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Inbox className="h-10 w-10 text-ink-disabled mb-3" />
                        <p className="text-sm text-ink-muted">No source captures</p>
                        <p className="text-xs text-ink-disabled mt-1">This epic was created without linking captures</p>
                      </div>
                    )}
                  </>
                )}

                {/* ═══ DEP TREE TAB ═══ */}
                {activeTab === 'dep-tree' && (
                  <div className="space-y-1">
                    <p className="text-xs text-ink-muted mb-4">
                      Dependency tree from <code className="text-accent font-mono">br dep tree {epic.beadId}</code>
                    </p>
                    {demoDeps.map((node) => {
                      const statusColor = node.status === 'ready' ? 'text-green-400' : node.status === 'in_progress' ? 'text-blue-400' : 'text-ink-muted'
                      const StatusIcon = node.status === 'ready' ? CheckCircle2 : Circle
                      return (
                        <div key={node.id} className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${node.depth * 24 + 8}px` }}>
                          {node.depth > 0 && (
                            <span className="text-ink-disabled text-xs">{'└─'}</span>
                          )}
                          <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusColor)} />
                          <code className="text-[11px] text-ink-muted font-mono">{node.id}</code>
                          <span className="text-sm text-ink">{node.title}</span>
                          <Badge variant="outline" className="text-[9px] ml-auto">{node.status}</Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ── Right column — metadata sidebar ── */}
              <div className="w-64 shrink-0 border-l border-edge bg-surface-base overflow-y-auto p-4 space-y-4">
                {/* Status */}
                <div>
                  <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Status</h4>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><button className="cursor-pointer"><Badge className={cn(uiStatusConfig[localStatus]?.className, 'cursor-pointer')}>{uiStatusConfig[localStatus]?.label}</Badge></button></DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuLabel>Change status</DropdownMenuLabel>
                      {Object.entries(uiStatusConfig).map(([key, cfg]) => (
                        <DropdownMenuItem key={key} onClick={() => handleStatusChange(cfg.label)}>
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
                        <DropdownMenuItem key={i} onClick={() => handlePriorityChange(i)}>
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
                        <DropdownMenuItem key={t} onClick={() => handleTypeChange(t)}>
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
                        <DropdownMenuItem key={u.id} onClick={() => handleAssigneeChange(u.id)}>
                          <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white mr-2" style={{ backgroundColor: u.color }}>{u.initials}</div>
                          {u.name}
                          {u.id === localAssigneeId && <span className="ml-auto text-[10px] text-accent">current</span>}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleAssigneeChange('')}><X className="h-3.5 w-3.5 mr-2 text-ink-muted" /> Unassign</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Labels — interactive add/remove */}
                <div>
                  <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Labels</h4>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {localLabels.map((label) => (
                      <Badge key={label} variant="outline" className="text-[10px] px-1.5 py-0 gap-1 group cursor-pointer" onClick={() => handleRemoveLabel(label)}>
                        {label}
                        <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted" />
                      </Badge>
                    ))}
                  </div>
                  <div className="flex items-center gap-1">
                    <Input
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLabel() } }}
                      placeholder="Add label..."
                      className="h-6 text-[10px] flex-1"
                    />
                    <button type="button" onClick={handleAddLabel} className="shrink-0 rounded-[var(--radius-sm)] p-1 text-ink-disabled hover:text-ink-muted transition-colors cursor-pointer">
                      <Tag className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Due date — inline input */}
                <div>
                  <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Due date</h4>
                  {showDueDateInput || localDueDate ? (
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={localDueDate}
                        onChange={(e) => setLocalDueDate(e.target.value)}
                        className="h-7 text-xs flex-1"
                        autoFocus={showDueDateInput && !localDueDate}
                      />
                      {localDueDate && (
                        <button type="button" onClick={() => { setLocalDueDate(''); setShowDueDateInput(false); toast('Due date cleared') }} className="shrink-0 p-1 text-ink-disabled hover:text-error transition-colors cursor-pointer">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowDueDateInput(true)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer">
                      <CalendarClock className="h-3.5 w-3.5" /> Set due date
                    </button>
                  )}
                </div>

                {/* Estimate — inline input */}
                <div>
                  <h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Estimate</h4>
                  {showEstimateInput || localEstimate ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={localEstimate}
                        onChange={(e) => setLocalEstimate(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSetEstimate() }}
                        placeholder="e.g., 4h, 2d, 1w"
                        className="h-7 text-xs flex-1"
                        autoFocus={showEstimateInput && !localEstimate}
                      />
                      {localEstimate && (
                        <button type="button" onClick={() => { setLocalEstimate(''); setShowEstimateInput(false); toast('Estimate cleared') }} className="shrink-0 p-1 text-ink-disabled hover:text-error transition-colors cursor-pointer">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowEstimateInput(true)} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer">
                      <Timer className="h-3.5 w-3.5" /> Set estimate
                    </button>
                  )}
                </div>

                <Separator />

                {epic.gitBranch && (<div><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Branch</h4><div className="flex items-center gap-1.5"><GitBranch className="h-3.5 w-3.5 text-ink-muted" /><code className="rounded bg-surface-elevated px-1.5 py-0.5 text-[11px] text-ink-secondary">{epic.gitBranch}</code></div></div>)}

                {epic.prUrl && epic.prNumber && (<div><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Pull Request</h4><button onClick={handleViewPR} className="flex items-center gap-1.5 text-sm text-accent hover:underline cursor-pointer"><ExternalLink className="h-3.5 w-3.5" /> PR #{epic.prNumber}</button>{epic.prStatus && <Badge variant="outline" className="text-[10px] mt-1">{epic.prStatus.replace(/_/g, ' ')}</Badge>}</div>)}

                {epicSessions.length > 0 && (<div><h4 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">Sessions</h4><div className="space-y-2">{epicSessions.map((s) => (<button key={s.id} onClick={() => { setSelectedEpicId(null); navigate(`/agents/${s.id}`) }} className="w-full rounded-[var(--radius-md)] border border-edge bg-surface-raised p-2 text-left hover:bg-surface-elevated transition-colors cursor-pointer"><div className="flex items-center gap-1.5"><span className={cn('inline-block h-2 w-2 rounded-full', sessionStatusColors[s.status], (s.status === 'running' || s.status === 'waiting_input') && 'animate-pulse')} /><span className="text-xs font-medium text-ink truncate">{s.agentName || 'Queued'}</span></div><div className="mt-1 flex items-center gap-2 text-[10px] text-ink-muted"><span>{s.status.replace('_', ' ')}</span><span>{formatDuration(s.duration)}</span></div></button>))}</div></div>)}

                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-muted"><Clock className="h-3 w-3" /> Created {formatTimestamp(epic.createdAt)}</div>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-muted"><Clock className="h-3 w-3" /> Updated {formatTimestamp(epic.updatedAt)}</div>
                </div>
              </div>
            </div>

            {/* ── Footer actions — status-aware ── */}
            <div className="flex items-center gap-2 border-t border-edge px-6 py-3 overflow-x-auto">
              {/* Primary action changes based on epic status */}
              {epic.uiStatus === 'blocked' && (
                <Button variant="outline" className="gap-2 shrink-0 text-red-400 border-red-400/30" disabled>
                  <Ban className="h-3.5 w-3.5" />Blocked
                </Button>
              )}
              {epic.uiStatus === 'ready' && (
                <Button className="gap-2 shrink-0" onClick={handleStartSession}>
                  <Play className="h-3.5 w-3.5" />Start Session
                </Button>
              )}
              {epic.uiStatus === 'in_progress' && (
                <Button variant="secondary" className="gap-2 shrink-0" onClick={() => { setSelectedEpicId(null); navigate(`/agents/${epic.activeSessionId || ''}`) }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />View Session
                </Button>
              )}
              {epic.uiStatus === 'in_review' && (
                <Button className="gap-2 shrink-0" onClick={() => { if (epic.prNumber) { setSelectedEpicId(null); navigate(`/review/${epic.prNumber}`) } }}>
                  <GitPullRequest className="h-3.5 w-3.5" />Review PR
                </Button>
              )}
              {epic.uiStatus === 'done' && (
                <Button variant="secondary" className="gap-2 shrink-0" onClick={() => toast.info('Viewing completed epic')}>
                  <Eye className="h-3.5 w-3.5" />View Summary
                </Button>
              )}

              <Button variant="outline" className="gap-2 shrink-0" onClick={() => toast.info('Edit mode')}><Pencil className="h-3.5 w-3.5" />Edit</Button>
              <Button variant="ghost" className="gap-2 shrink-0 text-ink-muted" onClick={handleDefer}><CalendarClock className="h-3.5 w-3.5" />Defer</Button>
              {epic.uiStatus === 'done'
                ? <Button variant="ghost" className="gap-2 shrink-0 text-ink-muted" onClick={handleReopenEpic}><RotateCcw className="h-3.5 w-3.5" />Reopen</Button>
                : <Button variant="ghost" className="gap-2 shrink-0 text-ink-muted" onClick={handleCloseEpic}><CheckCircle2 className="h-3.5 w-3.5" />Close</Button>}
              <Button variant="ghost" className="gap-2 shrink-0 text-error hover:text-error" onClick={() => { toast('Epic archived'); setSelectedEpicId(null) }}><Archive className="h-3.5 w-3.5" />Archive</Button>
            </div>
          </>
        ) : (
          <div className="p-6"><DialogTitle>No epic selected</DialogTitle><DialogDescription>Select an epic from the board.</DialogDescription></div>
        )}
      </DialogContent>
    </Dialog>
  )
}
