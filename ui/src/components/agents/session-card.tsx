import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, X, MessageSquare, LinkIcon, ArrowRight, RotateCcw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { AgentSession } from '@/data/sessions'
import { getUserById } from '@/data/users'
import { AskQuestionDialog } from './ask-question-dialog'
import { toast } from 'sonner'

interface SessionCardProps {
  session: AgentSession
}

function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function EpicBeadContext({ session }: { session: AgentSession }) {
  return (
    <div className="mt-2 space-y-0.5">
      <Link
        to={`/board?epic=${session.epicId}`}
        className="flex items-center gap-1.5 text-xs text-ink-secondary hover:text-accent transition-colors"
      >
        <LinkIcon className="h-3 w-3 shrink-0" />
        <span className="truncate">{session.epicTitle}</span>
      </Link>
      {session.beadTitle && (
        <div className="flex items-center gap-1.5 pl-[18px] text-xs text-ink-muted">
          <ArrowRight className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Bead: {session.beadTitle}</span>
        </div>
      )}
    </div>
  )
}

function LiveDuration({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(() => Math.floor(Date.now() / 1000) - startedAt)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor(Date.now() / 1000) - startedAt)
    }, 1000)
    return () => clearInterval(interval)
  }, [startedAt])

  return <span>{formatDuration(elapsed)}</span>
}

export function SessionCard({ session }: SessionCardProps) {
  const [questionOpen, setQuestionOpen] = useState(false)

  const handleCancel = () => {
    toast.info('Session cancellation not available in demo')
  }

  const handleRetry = () => {
    toast.info('Session retry not available in demo')
  }

  const handlePromote = () => {
    toast.info('Queue promotion not available in demo')
  }

  if (session.status === 'running') {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <span className="text-sm font-medium text-ink">{session.agentName}</span>
            <Badge variant="outline" className="text-[10px]">{session.model}</Badge>
          </div>

          <EpicBeadContext session={session} />

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <LiveDuration startedAt={session.startedAt} />
            <span className="text-ink-disabled">|</span>
            <span>{session.turns} turns</span>
            <span className="text-ink-disabled">|</span>
            <span>{session.filesModified} files</span>
          </div>
          <p className="mt-1.5 text-xs font-mono text-ink-muted truncate">{session.lastAction}</p>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agents/${session.id}`}>View Stream</Link>
            </Button>
            <Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (session.status === 'waiting_input') {
    return (
      <>
        <Card className="border-warning/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
              </span>
              <span className="text-sm font-medium text-ink">{session.agentName}</span>
              <Badge variant="warning" className="text-[10px]">
                <MessageSquare className="mr-1 h-3 w-3" />
                Waiting
              </Badge>
            </div>

            <EpicBeadContext session={session} />

            {session.question && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-sm text-ink-secondary">{session.question.text}</p>
              </div>
            )}

            <div className="mt-3 flex items-center gap-2">
              <Button size="sm" onClick={() => setQuestionOpen(true)}>
                Answer
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/agents/${session.id}`}>View Stream</Link>
              </Button>
              <Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
        {session.question && (
          <AskQuestionDialog
            session={session}
            open={questionOpen}
            onOpenChange={setQuestionOpen}
          />
        )}
      </>
    )
  }

  if (session.status === 'queued') {
    const requestedBy = getUserById(session.requestedById)
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] font-mono">
              #{session.queuePosition}
            </Badge>
            <Badge variant="default" className="text-[10px]">{session.model}</Badge>
          </div>

          <EpicBeadContext session={session} />

          <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
            <span>by {requestedBy?.name ?? 'Unknown'}</span>
            <span className="text-ink-disabled">|</span>
            <span>{formatDistanceToNow(session.startedAt * 1000, { addSuffix: true })}</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={handleCancel}>
              Cancel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePromote}>
              Promote
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (session.status === 'completed') {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-ink">{session.agentName}</span>
            <Badge variant="outline" className="text-[10px]">{session.model}</Badge>
          </div>

          <EpicBeadContext session={session} />

          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <span>{formatDuration(session.duration)}</span>
            <span className="text-ink-disabled">|</span>
            <span>{session.turns} turns</span>
            <span className="text-ink-disabled">|</span>
            <span>{session.filesModified} files</span>
            {session.prUrl && (
              <>
                <span className="text-ink-disabled">|</span>
                <a
                  href={session.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline"
                >
                  PR #{session.prNumber}
                  {session.prStatus && (
                    <Badge
                      variant={session.prStatus === 'merged' ? 'success' : session.prStatus === 'changes_requested' ? 'warning' : 'default'}
                      className="text-[9px] ml-1"
                    >
                      {session.prStatus === 'changes_requested' ? 'changes requested' : session.prStatus}
                    </Badge>
                  )}
                </a>
              </>
            )}
          </div>

          <div className="mt-3">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agents/${session.id}`}>View Stream</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (session.status === 'failed') {
    return (
      <Card className="border-error/20">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 text-error" />
            <span className="text-sm font-medium text-ink">{session.agentName}</span>
            <Badge variant="outline" className="text-[10px]">{session.model}</Badge>
          </div>

          <EpicBeadContext session={session} />

          <div className="mt-3 flex items-center gap-3 text-xs text-ink-muted">
            <span>{formatDuration(session.duration)}</span>
            <span className="text-ink-disabled">|</span>
            <span className="text-error">Error</span>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/agents/${session.id}`}>View Stream</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RotateCcw className="mr-1 h-3 w-3" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return null
}
