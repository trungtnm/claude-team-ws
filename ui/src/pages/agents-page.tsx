import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, Plus, Search, Maximize2, X,
  AlertTriangle, Loader2, LinkIcon, ArrowRight,
  GitPullRequest,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
// Separator available if needed
import { AgentStreamView } from '@/components/agents/agent-stream-view'
import { SessionStatsBar } from '@/components/agents/session-stats-bar'
import { AskQuestionDialog } from '@/components/agents/ask-question-dialog'
import { sessions, getSessionsByStatus, type AgentSession } from '@/data/sessions'
import { getUserById } from '@/data/users'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const statusConfig: Record<string, { dot: string; label: string; badge: 'success' | 'warning' | 'error' | 'default' }> = {
  running: { dot: 'bg-green-400', label: 'Running', badge: 'success' },
  waiting_input: { dot: 'bg-amber-400', label: 'Needs Input', badge: 'warning' },
  queued: { dot: 'bg-gray-400', label: 'Queued', badge: 'default' },
  completed: { dot: 'bg-green-400', label: 'Completed', badge: 'success' },
  failed: { dot: 'bg-red-400', label: 'Failed', badge: 'error' },
  cancelled: { dot: 'bg-gray-400', label: 'Cancelled', badge: 'default' },
}

function LiveDuration({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(interval)
  }, [])
  const seconds = now - startedAt
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return <span className="font-mono tabular-nums">{m}:{String(s).padStart(2, '0')}</span>
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${seconds % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

type FilterTab = 'active' | 'queued' | 'history'

export default function AgentsPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('active')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [questionOpen, setQuestionOpen] = useState(false)

  const running = getSessionsByStatus('running')
  const waiting = getSessionsByStatus('waiting_input')
  const queued = getSessionsByStatus('queued')
  const completed = getSessionsByStatus('completed')
  const failed = getSessionsByStatus('failed')

  // Auto-select first active session if none selected
  useEffect(() => {
    if (!selectedSessionId) {
      const firstActive = [...waiting, ...running][0]
      if (firstActive) setSelectedSessionId(firstActive.id)
    }
  }, [selectedSessionId, waiting, running])

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const match = (s: AgentSession) =>
      !q ||
      s.epicTitle.toLowerCase().includes(q) ||
      s.agentName.toLowerCase().includes(q) ||
      (s.beadTitle?.toLowerCase().includes(q) ?? false)

    switch (activeTab) {
      case 'active':
        return [...running, ...waiting].filter(match)
      case 'queued':
        return queued.filter(match)
      case 'history':
        return [...completed, ...failed].filter(match)
    }
  }, [searchQuery, activeTab, running, waiting, queued, completed, failed])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  const tabs: { id: FilterTab; label: string; count: number; dot?: string }[] = [
    { id: 'active', label: 'Active', count: running.length + waiting.length, dot: 'bg-green-400' },
    { id: 'queued', label: 'Queued', count: queued.length },
    { id: 'history', label: 'History', count: completed.length + failed.length },
  ]

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-ink">Agents</h1>
          {/* Live counters */}
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              {running.length + waiting.length} active
            </span>
            <span>{queued.length} queued</span>
            <span className="text-ink-disabled">· max 3 concurrent</span>
          </div>
        </div>
        <Button size="sm" onClick={() => toast.info('Session creation not available in demo')}>
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Button>
      </div>

      {/* ── Split panel ── */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Session list ── */}
        <div className="flex w-80 shrink-0 flex-col border-r border-edge">
          {/* Tabs */}
          <div className="flex items-center border-b border-edge">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors cursor-pointer',
                  activeTab === tab.id
                    ? 'text-accent border-b-2 border-accent -mb-px'
                    : 'text-ink-muted hover:text-ink-secondary',
                )}
              >
                {tab.dot && activeTab === tab.id && (
                  <span className={cn('h-1.5 w-1.5 rounded-full', tab.dot)} />
                )}
                {tab.label}
                <span className="text-[10px] text-ink-disabled">({tab.count})</span>
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="px-2 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-ink-muted" />
              <Input
                placeholder="Filter sessions..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>

          {/* Session list */}
          <ScrollArea className="flex-1">
            <div className="px-2 pb-2">
              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <Bot className="h-8 w-8 text-ink-disabled mb-2" />
                  <p className="text-xs text-ink-muted">
                    {searchQuery ? 'No sessions match' : `No ${activeTab} sessions`}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filteredSessions.map((session) => (
                    <SessionListItem
                      key={session.id}
                      session={session}
                      selected={session.id === selectedSessionId}
                      onClick={() => setSelectedSessionId(session.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* ── Right: Session detail / stream preview ── */}
        <div className="flex flex-1 flex-col min-w-0">
          {selectedSession ? (
            <>
              {/* Session header */}
              <div className="border-b border-edge px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-ink">{selectedSession.agentName || 'Unassigned'}</span>
                    <Badge variant="outline" className="text-[10px]">{selectedSession.model}</Badge>
                    <Badge variant={statusConfig[selectedSession.status]?.badge ?? 'default'}>
                      {statusConfig[selectedSession.status]?.label}
                    </Badge>
                    {(selectedSession.status === 'running' || selectedSession.status === 'waiting_input') && (
                      <span className="text-xs text-ink-muted">
                        <LiveDuration startedAt={selectedSession.startedAt} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-ink-muted"
                      onClick={() => navigate(`/agents/${selectedSession.id}`)}
                    >
                      <Maximize2 className="h-3 w-3" />
                      Full View
                    </Button>
                    {(selectedSession.status === 'running' || selectedSession.status === 'waiting_input') && (
                      <Button variant="ghost" size="sm" className="text-xs text-error hover:text-error" onClick={() => toast.info('Cancel not available in demo')}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Live metrics bar for active sessions */}
                {(selectedSession.status === 'running' || selectedSession.status === 'waiting_input') && (
                  <div className="mt-2 flex items-center gap-4">
                    {/* Context window gauge */}
                    {selectedSession.contextWindowPercent !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-ink-muted">Context</span>
                        <div className="h-1.5 w-20 rounded-full bg-surface-elevated">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all',
                              selectedSession.contextWindowPercent > 80 ? 'bg-red-400' : selectedSession.contextWindowPercent > 60 ? 'bg-amber-400' : 'bg-accent/60',
                            )}
                            style={{ width: `${selectedSession.contextWindowPercent}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-ink-disabled">{selectedSession.contextWindowPercent}%</span>
                      </div>
                    )}
                    {selectedSession.tokensUsed !== undefined && (
                      <span className="text-[10px] text-ink-muted">
                        {(selectedSession.tokensUsed / 1000).toFixed(1)}k tokens
                      </span>
                    )}
                    {selectedSession.costUsd !== undefined && (
                      <span className="text-[10px] text-accent font-medium">
                        ${selectedSession.costUsd.toFixed(2)}
                      </span>
                    )}
                    <span className="text-[10px] text-ink-disabled">
                      {selectedSession.turns} turns · {selectedSession.filesModified} files
                    </span>
                  </div>
                )}

                {/* Context line */}
                <div className="mt-1.5 flex items-center gap-4 text-xs text-ink-muted">
                  <span className="flex items-center gap-1">
                    <LinkIcon className="h-3 w-3" />
                    {selectedSession.epicTitle}
                  </span>
                  {selectedSession.beadTitle && (
                    <span className="flex items-center gap-1">
                      <ArrowRight className="h-2.5 w-2.5" />
                      {selectedSession.beadTitle}
                    </span>
                  )}
                  {selectedSession.prNumber && (
                    <span className="flex items-center gap-1 text-accent">
                      <GitPullRequest className="h-3 w-3" />
                      PR #{selectedSession.prNumber}
                    </span>
                  )}
                </div>
              </div>

              {/* Waiting input banner */}
              {selectedSession.status === 'waiting_input' && selectedSession.question && (
                <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-amber-400">Agent is waiting for your input</p>
                      <p className="mt-1 text-sm text-ink-secondary">{selectedSession.question.text}</p>
                      {selectedSession.question.context && (
                        <p className="mt-1 text-[11px] text-ink-muted font-mono">{selectedSession.question.context}</p>
                      )}
                    </div>
                    <Button size="sm" onClick={() => setQuestionOpen(true)}>
                      Answer
                    </Button>
                  </div>
                </div>
              )}

              {/* Stream view */}
              <div className="flex-1 overflow-hidden">
                <AgentStreamView sessionId={selectedSession.id} />
              </div>

              {/* Stats bar */}
              <SessionStatsBar session={selectedSession} />

              {/* Question dialog */}
              {selectedSession.question && selectedSession.status === 'waiting_input' && (
                <AskQuestionDialog
                  session={selectedSession}
                  open={questionOpen}
                  onOpenChange={setQuestionOpen}
                />
              )}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Bot className="mx-auto h-12 w-12 text-ink-disabled mb-3" />
                <p className="text-sm text-ink-muted">Select a session to view its stream</p>
                <p className="text-xs text-ink-disabled mt-1">Or start a new session from an Epic</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Session list item (left panel) ── */
function SessionListItem({
  session,
  selected,
  onClick,
}: {
  session: AgentSession
  selected: boolean
  onClick: () => void
}) {
  const config = statusConfig[session.status] ?? statusConfig.cancelled
  const isActive = session.status === 'running' || session.status === 'waiting_input'
  const requester = getUserById(session.requestedById)

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-[var(--radius-md)] px-3 py-2.5 text-left transition-all cursor-pointer',
        selected
          ? 'bg-surface-elevated border border-accent/30'
          : 'hover:bg-surface-elevated/50 border border-transparent',
        session.status === 'waiting_input' && !selected && 'bg-amber-500/5 border-amber-500/15',
      )}
    >
      {/* Top row: agent name + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'inline-block h-2 w-2 shrink-0 rounded-full',
            config.dot,
            isActive && 'animate-pulse',
          )} />
          <span className="text-sm font-medium text-ink truncate">
            {session.agentName || `Queue #${session.queuePosition}`}
          </span>
        </div>
        <Badge variant={config.badge} className="text-[9px] shrink-0 ml-2">
          {config.label}
        </Badge>
      </div>

      {/* Epic + bead */}
      <p className="mt-1 text-xs text-ink-secondary truncate">{session.epicTitle}</p>
      {session.beadTitle && (
        <p className="text-[11px] text-ink-muted truncate">→ {session.beadTitle}</p>
      )}

      {/* Bottom row: stats */}
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-disabled">
        {isActive ? (
          <>
            <span className="flex items-center gap-1">
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
              <LiveDuration startedAt={session.startedAt} />
            </span>
            <span>{session.turns} turns</span>
            <span>{session.filesModified} files</span>
            {session.costUsd !== undefined && (
              <span className="text-accent">${session.costUsd.toFixed(2)}</span>
            )}
          </>
        ) : session.status === 'queued' ? (
          <>
            <span>#{session.queuePosition} in queue</span>
            <span>{requester?.name}</span>
          </>
        ) : (
          <>
            <span>{formatDuration(session.duration)}</span>
            <span>{session.turns} turns</span>
            {session.prNumber && (
              <span className="flex items-center gap-0.5 text-accent">
                <GitPullRequest className="h-2.5 w-2.5" />
                #{session.prNumber}
              </span>
            )}
          </>
        )}
      </div>

      {/* Context window gauge for active sessions */}
      {isActive && session.contextWindowPercent !== undefined && (
        <div className="mt-1.5">
          <div className="h-1 rounded-full bg-surface-elevated">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                session.contextWindowPercent > 80 ? 'bg-red-400' : session.contextWindowPercent > 60 ? 'bg-amber-400' : 'bg-accent/60',
              )}
              style={{ width: `${session.contextWindowPercent}%` }}
            />
          </div>
          <p className="mt-0.5 text-[9px] text-ink-disabled">{session.contextWindowPercent}% context</p>
        </div>
      )}

      {/* Waiting input question preview */}
      {session.status === 'waiting_input' && session.question && (
        <div className="mt-1.5 rounded-[var(--radius-sm)] bg-amber-500/10 px-2 py-1">
          <p className="text-[11px] text-amber-400 line-clamp-1">{session.question.text}</p>
        </div>
      )}

      {/* Last action for running */}
      {session.status === 'running' && session.lastAction && (
        <p className="mt-1 text-[10px] text-ink-disabled font-mono truncate">{session.lastAction}</p>
      )}
    </button>
  )
}
