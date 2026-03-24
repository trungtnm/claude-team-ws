import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Bot, Plus, Search, Maximize2, X, Loader2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSessionsQuery, useSessionSocket, useCancelSessionMutation, type SessionSummary } from '@/hooks/use-sessions'
import { useSocketRoom } from '@/hooks/use-socket'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const statusConfig: Record<string, { dot: string; label: string; badge: 'success' | 'warning' | 'error' | 'default' | 'info' }> = {
  queued: { dot: 'bg-gray-400', label: 'Queued', badge: 'default' },
  running: { dot: 'bg-green-400', label: 'Running', badge: 'success' },
  waiting_input: { dot: 'bg-amber-400', label: 'Needs Input', badge: 'warning' },
  validation_failed: { dot: 'bg-red-400', label: 'Validation Failed', badge: 'error' },
  completed: { dot: 'bg-green-400', label: 'Completed', badge: 'success' },
  failed: { dot: 'bg-red-400', label: 'Failed', badge: 'error' },
  cancelled: { dot: 'bg-gray-400', label: 'Cancelled', badge: 'default' },
  detached: { dot: 'bg-blue-400', label: 'Detached', badge: 'info' },
}

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_input'])
const HISTORY_STATUSES = new Set(['completed', 'failed', 'cancelled', 'validation_failed', 'detached'])

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
  const { projectId } = useParams<{ projectId: string }>()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('active')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)

  // Join project room for real-time updates
  useSocketRoom(projectId ? `project:${projectId}` : undefined)
  useSessionSocket(projectId!)

  const { data: sessions = [], isLoading, isError } = useSessionsQuery(projectId!)
  const cancelSession = useCancelSessionMutation(projectId!)

  const activeSessions = useMemo(() =>
    sessions.filter((s) => ACTIVE_STATUSES.has(s.status)),
    [sessions],
  )
  const historySessions = useMemo(() =>
    sessions.filter((s) => HISTORY_STATUSES.has(s.status)),
    [sessions],
  )

  // Auto-select first active session
  useEffect(() => {
    if (!selectedSessionId && activeSessions.length > 0) {
      setSelectedSessionId(activeSessions[0].id)
    }
  }, [selectedSessionId, activeSessions])

  const filteredSessions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const match = (s: SessionSummary) =>
      !q || s.prompt.toLowerCase().includes(q) || (s.agent_mail_name?.toLowerCase().includes(q) ?? false)

    return (activeTab === 'active' ? activeSessions : historySessions).filter(match)
  }, [searchQuery, activeTab, activeSessions, historySessions])

  const selectedSession = sessions.find((s) => s.id === selectedSessionId)

  const tabs: { id: FilterTab; label: string; count: number; dot?: string }[] = [
    { id: 'active', label: 'Active', count: activeSessions.length, dot: 'bg-green-400' },
    { id: 'history', label: 'History', count: historySessions.length },
  ]

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
        <p className="text-sm text-ink-secondary">Failed to load sessions</p>
        <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
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
              {activeSessions.length} active
            </span>
          </div>
        </div>
        <Button size="sm" onClick={() => toast.info('Start sessions from the Board page')}>
          <Plus className="h-3.5 w-3.5" />
          New Session
        </Button>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Session list */}
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

        {/* Right: Session detail */}
        <div className="flex flex-1 flex-col min-w-0">
          {selectedSession ? (
            <>
              {/* Session header */}
              <div className="border-b border-edge px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <span className="text-sm font-medium text-ink">
                      {selectedSession.agent_mail_name ?? selectedSession.id.slice(0, 8)}
                    </span>
                    <Badge variant="outline" className="text-[10px]">{selectedSession.model}</Badge>
                    <Badge variant={statusConfig[selectedSession.status]?.badge ?? 'default'}>
                      {statusConfig[selectedSession.status]?.label}
                    </Badge>
                    {selectedSession.started_at && ACTIVE_STATUSES.has(selectedSession.status) && (
                      <span className="text-xs text-ink-muted">
                        <LiveDuration startedAt={selectedSession.started_at} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs text-ink-muted"
                      onClick={() => navigate(`/projects/${projectId}/agents/${selectedSession.id}`)}
                    >
                      <Maximize2 className="h-3 w-3" />
                      Full View
                    </Button>
                    {ACTIVE_STATUSES.has(selectedSession.status) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-error hover:text-error"
                        onClick={() => {
                          cancelSession.mutate(selectedSession.id, {
                            onSuccess: () => toast.success('Session cancelled'),
                            onError: (err) => toast.error(err.message),
                          })
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Prompt preview */}
              <div className="flex-1 overflow-auto p-4">
                <div className="rounded-[var(--radius-md)] bg-surface-elevated p-4 border border-edge">
                  <p className="text-xs text-ink-muted mb-1">Prompt</p>
                  <p className="text-sm text-ink whitespace-pre-wrap">{selectedSession.prompt}</p>
                </div>
                {selectedSession.pr_url && (
                  <div className="mt-3 rounded-[var(--radius-md)] bg-surface-elevated p-3 border border-edge">
                    <p className="text-xs text-ink-muted mb-1">Pull Request</p>
                    <a
                      href={selectedSession.pr_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-accent hover:underline"
                    >
                      {selectedSession.pr_url}
                    </a>
                    {selectedSession.pr_status && (
                      <Badge variant="outline" className="ml-2 text-[10px]">{selectedSession.pr_status}</Badge>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <Bot className="mx-auto h-12 w-12 text-ink-disabled mb-3" />
                <p className="text-sm text-ink-muted">Select a session to view details</p>
                <p className="text-xs text-ink-disabled mt-1">Or start a new session from an Epic</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Session list item ── */
function SessionListItem({
  session,
  selected,
  onClick,
}: {
  session: SessionSummary
  selected: boolean
  onClick: () => void
}) {
  const config = statusConfig[session.status] ?? statusConfig.cancelled
  const isActive = ACTIVE_STATUSES.has(session.status)

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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn(
            'inline-block h-2 w-2 shrink-0 rounded-full',
            config.dot,
            isActive && 'animate-pulse',
          )} />
          <span className="text-sm font-medium text-ink truncate">
            {session.agent_mail_name ?? session.id.slice(0, 8)}
          </span>
        </div>
        <Badge variant={config.badge} className="text-[9px] shrink-0 ml-2">
          {config.label}
        </Badge>
      </div>

      <p className="mt-1 text-xs text-ink-secondary truncate">{session.prompt}</p>

      <div className="mt-1.5 flex items-center gap-3 text-[10px] text-ink-disabled">
        {isActive && session.started_at ? (
          <span className="flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            <LiveDuration startedAt={session.started_at} />
          </span>
        ) : session.started_at && session.finished_at ? (
          <span>{formatDuration(session.finished_at - session.started_at)}</span>
        ) : null}
        <span>{session.model}</span>
      </div>
    </button>
  )
}
