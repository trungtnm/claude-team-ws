import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MessageSquare, Send, Inbox, Loader2,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { PriorityBadge } from '@/components/board/priority-badge'
// BeadList removed — epics now use app DB as single source of truth
import { EpicSidebarMeta } from '@/components/board/epic-sidebar-meta'
import { EpicFooterActions } from '@/components/board/epic-footer-actions'
import { useBoardStore } from '@/stores/board-store'
import { useEpicDetail, useUpdateEpic } from '@/hooks/use-epics'
import { getInitials, getUserColor } from '@/lib/user-utils'
import { useMembers } from '@/hooks/use-settings'
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

type TabId = 'overview' | 'sources' | 'dep-tree'


export function EpicDetailSheet() {
  const { selectedEpicId, setSelectedEpicId } = useBoardStore()
  const navigate = useNavigate()
  const { data: epicDetail, isLoading } = useEpicDetail(selectedEpicId)
  const updateEpic = useUpdateEpic()

  const epic = epicDetail ?? undefined
  const epicSessions = epicDetail?.sessions ?? []
  // Beads removed — epics are now self-contained in app DB

  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)

  // Local interactive state for sidebar fields
  const [localStatus, setLocalStatus] = useState(epic?.uiStatus ?? 'blocked')
  const [localPriority, setLocalPriority] = useState(epic?.priority ?? 2)
  const [localType, setLocalType] = useState(epic?.type ?? 'feature')
  const [localAssigneeId, setLocalAssigneeId] = useState(epic?.assignee ?? '')
  const [localLabels, setLocalLabels] = useState(epic?.labels ?? [])
  const [localDueDate, setLocalDueDate] = useState('')
  const [localEstimate, setLocalEstimate] = useState('')
  const [labelInput, setLabelInput] = useState('')
  const [showDueDateInput, setShowDueDateInput] = useState(false)
  const [showEstimateInput, setShowEstimateInput] = useState(false)

  // Reset local UI-only state when epic ID changes
  useEffect(() => {
    if (epic) {
      setLocalDueDate('')
      setLocalEstimate('')
      setLabelInput('')
      setShowDueDateInput(false)
      setShowEstimateInput(false)
    }
  }, [epic?.id])

  // Sync local state from server data (re-runs when server data changes via refetch)
  useEffect(() => {
    if (epic) {
      setLocalStatus(epic.uiStatus)
      setLocalPriority(epic.priority)
      setLocalType(epic.type)
      setLocalAssigneeId(epic.assignee ?? '')
      setLocalLabels([...epic.labels])
    }
  }, [epic?.id, epic?.uiStatus, epic?.priority, epic?.type, epic?.assignee, epic?.updatedAt])

  const { data: members = [] } = useMembers()
  const localAssigneeMember = members.find((m) => m.userId === localAssigneeId)
  const localAssignee = localAssigneeMember
    ? { id: localAssigneeMember.userId, name: localAssigneeMember.name, initials: getInitials(localAssigneeMember.name), color: getUserColor(localAssigneeMember.userId) }
    : undefined

  const sourceCount = 0

  // ─── Mutation helpers ───────────────────────────────────────────────────────

  const mutateStatus = (newStatus: string, successMsg: string) => {
    if (!epic) return
    const prevStatus = localStatus
    setLocalStatus(newStatus as typeof localStatus)
    updateEpic.mutate(
      { epicId: epic.id, uiStatus: newStatus },
      {
        onSuccess: () => toast.success(successMsg),
        onError: (err) => {
          setLocalStatus(prevStatus)
          toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
        },
      },
    )
  }

  const handleStatusChange = (status: string) => {
    const key = Object.entries(uiStatusConfig).find(([, v]) => v.label === status)?.[0]
    if (key) mutateStatus(key, `Status → ${status}`)
  }

  const handlePriorityChange = (idx: number) => {
    if (!epic) return
    const prev = localPriority
    setLocalPriority(idx as 0|1|2|3)
    updateEpic.mutate(
      { epicId: epic.id, priority: idx },
      {
        onSuccess: () => toast.success(`Priority → P${idx}`),
        onError: (err) => { setLocalPriority(prev); toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`) },
      },
    )
  }

  const handleTypeChange = (t: string) => {
    if (!epic) return
    const prev = localType
    setLocalType(t as typeof localType)
    updateEpic.mutate(
      { epicId: epic.id, type: t },
      {
        onSuccess: () => toast.success(`Type → ${t}`),
        onError: (err) => { setLocalType(prev); toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`) },
      },
    )
  }

  const handleAssigneeChange = (userId: string) => {
    if (!epic) return
    const prev = localAssigneeId
    setLocalAssigneeId(userId)
    const u = members.find((m) => m.userId === userId)
    updateEpic.mutate(
      { epicId: epic.id, assignee: userId || null },
      {
        onSuccess: () => toast.success(userId === '' ? 'Unassigned' : `Assigned to ${u?.name}`),
        onError: (err) => { setLocalAssigneeId(prev); toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`) },
      },
    )
  }

  const handleAddLabel = () => {
    if (!epic) return
    const val = labelInput.trim().toLowerCase()
    if (!val) return
    if (localLabels.includes(val)) { setLabelInput(''); return }
    const newLabels = [...localLabels, val]
    setLocalLabels(newLabels)
    setLabelInput('')
    updateEpic.mutate(
      { epicId: epic.id, labels: newLabels },
      {
        onSuccess: () => toast.success(`Label "${val}" added`),
        onError: (err) => { setLocalLabels(localLabels); toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`) },
      },
    )
  }

  const handleRemoveLabel = (label: string) => {
    if (!epic) return
    const newLabels = localLabels.filter((l) => l !== label)
    setLocalLabels(newLabels)
    updateEpic.mutate(
      { epicId: epic.id, labels: newLabels },
      {
        onSuccess: () => toast.success('Label removed'),
        onError: (err) => { setLocalLabels(localLabels); toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`) },
      },
    )
  }

  const handleSetEstimate = () => {
    if (localEstimate.trim()) toast.info(`Estimate set to ${localEstimate} (local)`)
    setShowEstimateInput(false)
  }
  const handleDefer = () => mutateStatus('blocked', 'Epic deferred')
  const handleCloseEpic = () => {
    if (!epic) return
    updateEpic.mutate(
      { epicId: epic.id, uiStatus: 'done' },
      {
        onSuccess: () => { toast.success('Epic closed'); setSelectedEpicId(null) },
        onError: (err) => toast.error(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`),
      },
    )
  }
  const handleReopenEpic = () => mutateStatus('ready', 'Epic reopened')
  const handleAddComment = () => { if (!commentText.trim()) return; toast.info('Comment added (local)'); setCommentText('') }
  const handleStartSession = () => { toast.success('Starting agent session...'); navigate('/agents') }
  const handleViewPR = () => { if (epic?.prNumber) navigate(`/review/${epic.prNumber}`) }

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'sources', label: 'Source Captures', count: sourceCount },
    { id: 'dep-tree', label: 'Dep Tree' },
  ]

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={selectedEpicId !== null} onOpenChange={(open) => { if (!open) { setSelectedEpicId(null); setActiveTab('overview') } }}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-ink-muted" />
          </div>
        ) : epic ? (
          <>
            <DialogTitle className="sr-only">{epic.title}</DialogTitle>
            <DialogDescription className="sr-only">Epic details</DialogDescription>

            {/* ── Header bar ── */}
            <div className="px-6 pt-5 pb-0">
              <div className="flex items-center gap-2 mb-2">
                <PriorityBadge priority={epic.priority} />
                <Badge className={cn('text-[10px]', typeColors[epic.type])}>{epic.type}</Badge>
                <code className="text-[10px] text-ink-muted font-mono">{epic.id}</code>
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

                    <Separator />

                    <div>
                      <button type="button" onClick={() => setShowComments(!showComments)} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer">
                        <MessageSquare className="h-3.5 w-3.5" /> Comments
                      </button>
                      {showComments && (
                        <div className="mt-3 space-y-3 animate-[composer-in_150ms_ease-out]">
                          <div className="flex items-center gap-2 pt-1">
                            <Input value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment() }} placeholder="Add a comment..." aria-label="Add a comment" className="h-8 text-xs flex-1" />
                            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleAddComment} disabled={!commentText.trim()} aria-label="Send comment"><Send className="h-3.5 w-3.5" /></Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ═══ SOURCE CAPTURES TAB ═══ */}
                {activeTab === 'sources' && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Inbox className="h-10 w-10 text-ink-disabled mb-3" />
                    <p className="text-sm text-ink-muted">No source captures</p>
                    <p className="text-xs text-ink-disabled mt-1">This epic was created without linking captures</p>
                  </div>
                )}

                {/* ═══ DEP TREE TAB ═══ */}
                {activeTab === 'dep-tree' && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <p className="text-sm text-ink-muted">Dependency tree not available</p>
                    <p className="text-xs text-ink-disabled mt-1">Epics now use the app database as single source of truth</p>
                  </div>
                )}
              </div>

              {/* ── Right column — metadata sidebar ── */}
              <EpicSidebarMeta
                epic={epic}
                localStatus={localStatus}
                localPriority={localPriority}
                localType={localType}
                localAssignee={localAssignee}
                localAssigneeId={localAssigneeId}
                localLabels={localLabels}
                localDueDate={localDueDate}
                localEstimate={localEstimate}
                labelInput={labelInput}
                showDueDateInput={showDueDateInput}
                showEstimateInput={showEstimateInput}
                onStatusChange={handleStatusChange}
                onPriorityChange={handlePriorityChange}
                onTypeChange={handleTypeChange}
                onAssigneeChange={handleAssigneeChange}
                onAddLabel={handleAddLabel}
                onRemoveLabel={handleRemoveLabel}
                onSetEstimate={handleSetEstimate}
                onLabelInputChange={setLabelInput}
                onDueDateChange={setLocalDueDate}
                onEstimateChange={setLocalEstimate}
                onShowDueDateInput={setShowDueDateInput}
                onShowEstimateInput={setShowEstimateInput}
                onViewPR={handleViewPR}
                onViewSession={(sessionId) => { setSelectedEpicId(null); navigate(`/agents/${sessionId}`) }}
                sessions={epicSessions}
              />
            </div>

            {/* ── Footer actions ── */}
            <EpicFooterActions
              epic={epic}
              onStartSession={handleStartSession}
              onViewSession={() => { setSelectedEpicId(null); navigate(`/agents/${epic.activeSessionId || ''}`) }}
              onReviewPR={() => { if (epic.prNumber) { setSelectedEpicId(null); navigate(`/review/${epic.prNumber}`) } }}
              onDefer={handleDefer}
              onClose={handleCloseEpic}
              onReopen={handleReopenEpic}
              onArchive={() => { toast('Epic archived'); setSelectedEpicId(null) }}
            />
          </>
        ) : (
          <div className="p-6"><DialogTitle>No epic selected</DialogTitle><DialogDescription>Select an epic from the board.</DialogDescription></div>
        )}
      </DialogContent>
    </Dialog>
  )
}
