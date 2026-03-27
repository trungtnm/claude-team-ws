import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot, Plus, Search, Maximize2, X, PanelLeftOpen,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AgentStreamView } from '@/components/agents/agent-stream-view'
import { SessionStatsBar } from '@/components/agents/session-stats-bar'
import { SessionInput } from '@/components/agents/session-input'
import { PermissionModeBar } from '@/components/agents/permission-mode-bar'
import { NewSessionDialog } from '@/components/agents/new-session-dialog'
import { useSessionsQuery, useCancelSessionMutation, useSessionRoom, isActiveSession } from '@/hooks/use-sessions'
import { cn } from '@/lib/utils'
import type { AgentSession } from '@/types'

const statusConfig: Record<string, { dot: string; label: string; badge: 'success' | 'warning' | 'error' | 'default' | 'info' }> = {
  queued: { dot: 'bg-blue-400', label: 'Queued', badge: 'info' },
  running: { dot: 'bg-green-400', label: 'Running', badge: 'success' },
  idle: { dot: 'bg-blue-400', label: 'Idle', badge: 'info' },
  waiting_input: { dot: 'bg-amber-400', label: 'Needs Input', badge: 'warning' },
  completed: { dot: 'bg-green-400', label: 'Completed', badge: 'success' },
  failed: { dot: 'bg-red-400', label: 'Failed', badge: 'error' },
  cancelled: { dot: 'bg-gray-400', label: 'Cancelled', badge: 'default' },
  detached: { dot: 'bg-gray-400', label: 'Detached', badge: 'default' },
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

type FilterTab = 'active' | 'history'

export default function AgentsPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('active')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [newSessionOpen, setNewSessionOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const { data: allSessions = [], isLoading, error } = useSessionsQuery()
  const cancelMutation = useCancelSessionMutation()

  // Join Socket.IO room for the selected session to get real-time events
  useSessionRoom(selectedSessionId ?? undefined)

  const running = useMemo(() => allSessions.filter((s) => s.status === 'running'), [allSessions])
  const waiting = useMemo(() => allSessions.filter((s) => s.status === 'waiting_input'), [allSessions])
  const idle = useMemo(() => allSessions.filter((s) => s.status === 'queued'), [allSessions])
  const completed = useMemo(() => allSessions.filter((s) => s.status === 'completed'), [allSessions])
  const failed = useMemo(() => allSessions.filter((s) => s.status === 'failed' || s.status === 'cancelled'), [allSessions])

  // Auto-select first active session if none selected
  useEffect(() => {
    if (!selectedSessionId) {
      const firstActive = [...waiting, ...running, ...idle][0]
      if (firstActive) setSelectedSessionId(firstActive.id)
    }
  }, [selectedSessionId, waiting, running, idle])

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const match = (s: AgentSession) =>
      !q ||
      s.prompt.toLowerCase().includes(q) ||
      (s.name?.toLowerCase().includes(q) ?? false)

    switch (activeTab) {
      case 'active':
        return [...running, ...waiting, ...idle].filter(match)
      case 'history':
        return [...completed, ...failed].filter(match)
    }
  }, [searchQuery, activeTab, running, waiting, idle, completed, failed])

  const selectedSession = allSessions.find((s) => s.id === selectedSessionId)

  const tabs: { id: FilterTab; label: string; count: number; dot?: string }[] = [
    { id: 'active', label: 'Active', count: running.length + waiting.length + idle.length, dot: 'bg-green-400' },
    { id: 'history', label: 'History', count: completed.length + failed.length },
  ]

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ink-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p className="text-sm" style={{ color: 'var(--error)' }}>Failed to load data</p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{(error as Error).message}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-edge px-4 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-ink">Agents</h1>
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-400" />
              </span>
              {running.length + waiting.length + idle.length} active
            </span>
            <span className="text-ink-disabled">· max 3 concurrent</span>
          </div>
        </div>
        <Button size="sm" onClick={() => setNewSessionOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Session list — hidden on mobile when collapsed */}
        <div className={cn(
          'flex shrink-0 flex-col border-r border-edge transition-all',
          sidebarOpen ? 'w-full md:w-80' : 'hidden md:flex md:w-80',
        )}>
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
                      onClick={() => {
                        setSelectedSessionId(session.id)
                        setSidebarOpen(false)
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: Session detail / stream preview — hidden on mobile when sidebar is open */}
        <div className={cn(
          'flex flex-1 flex-col min-w-0',
          sidebarOpen && 'hidden md:flex',
        )}>
          {selectedSession ? (
            <>
              {/* Session header */}
              <div className="border-b border-edge px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="md:hidden h-7 w-7 p-0"
                      onClick={() => setSidebarOpen(true)}
                    >
                      <PanelLeftOpen className="h-4 w-4" />
                    </Button>
                    <span className="text-sm font-medium text-ink truncate max-w-sm">{selectedSession.name || selectedSession.prompt}</span>
                    <Badge variant="outline" className="text-[10px]">{selectedSession.model}</Badge>
                    <Badge variant={statusConfig[selectedSession.status]?.badge ?? 'default'}>
                      {statusConfig[selectedSession.status]?.label}
                    </Badge>
                    {isActiveSession(selectedSession) && selectedSession.startedAt && (
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
                    {selectedSession.status === 'queued' && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(selectedSession.id)}
                      >
                        Cancel
                      </Button>
                    )}
                    {(selectedSession.status === 'running' || selectedSession.status === 'waiting_input') && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-error hover:text-error"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(selectedSession.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Permission mode bar */}
                {isActiveSession(selectedSession) && (
                  <div className="mt-2">
                    <PermissionModeBar sessionId={selectedSession.id} currentMode="bypassPermissions" />
                  </div>
                )}
              </div>

              {/* Stream view */}
              <div className="flex-1 min-h-0">
                <AgentStreamView sessionId={selectedSession.id} />
              </div>

              {/* Stats bar + input */}
              <div className="shrink-0">
                <SessionStatsBar session={selectedSession} />
                <SessionInput
                  session={selectedSession}
                  onCancel={() => cancelMutation.mutate(selectedSession.id)}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center">
              <Button
                variant="ghost"
                size="sm"
                className="md:hidden self-start m-3"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeftOpen className="h-4 w-4 mr-1.5" />
                Sessions
              </Button>
              <div className="text-center">
                <Bot className="mx-auto h-12 w-12 text-ink-disabled mb-3" />
                <p className="text-sm text-ink-muted">Select a session to view its stream</p>
                <p className="text-xs text-ink-disabled mt-1">Or start a new session from an Epic</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New session dialog */}
      <NewSessionDialog
        open={newSessionOpen}
        onOpenChange={setNewSessionOpen}
        onCreated={(id) => setSelectedSessionId(id)}
      />
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
  const active = isActiveSession(session)

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
        session.status === 'queued' && !selected && 'bg-blue-500/5 border-blue-500/15',
      )}
    >
      {/* Top row: prompt + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'inline-block h-2 w-2 shrink-0 rounded-full',
            config.dot,
            active && 'animate-pulse',
          )} />
          <span className="text-sm font-medium text-ink truncate">
            {session.name || session.prompt.slice(0, 60)}
          </span>
        </div>
        <Badge variant={config.badge} className="text-[9px] shrink-0 ml-2">
          {config.label}
        </Badge>
      </div>

      {/* Model + epic reference */}
      <div className="mt-1 flex items-center gap-2 text-[10px] text-ink-disabled">
        <span>{session.model}</span>
        {session.epic?.bead?.title && (
          <>
            <span>·</span>
            <span className="truncate">{session.epic.bead.title}</span>
          </>
        )}
      </div>

      {/* Bottom row: stats */}
      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-disabled">
        {active && session.startedAt ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <LiveDuration startedAt={session.startedAt} />
          </span>
        ) : session.startedAt && session.finishedAt ? (
          <span>{formatDuration(session.finishedAt - session.startedAt)}</span>
        ) : (
          <span>Created {new Date(session.createdAt * 1000).toLocaleTimeString()}</span>
        )}
      </div>
    </button>
  )
}
