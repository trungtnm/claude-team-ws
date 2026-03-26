import {
  Play, Pencil, CheckCircle2, CalendarClock, Archive,
  RotateCcw, Eye, Loader2, GitPullRequest, Ban,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { Epic } from '@/data/epics'

interface EpicFooterActionsProps {
  epic: Epic
  onStartSession: () => void
  onViewSession: () => void
  onReviewPR: () => void
  onDefer: () => void
  onClose: () => void
  onReopen: () => void
  onArchive: () => void
}

export function EpicFooterActions({
  epic,
  onStartSession,
  onViewSession,
  onReviewPR,
  onDefer,
  onClose,
  onReopen,
  onArchive,
}: EpicFooterActionsProps) {
  return (
    <div className="flex items-center gap-2 border-t border-edge px-6 py-3 overflow-x-auto">
      {epic.uiStatus === 'blocked' && (
        <Button variant="outline" className="gap-2 shrink-0 text-red-400 border-red-400/30" disabled>
          <Ban className="h-3.5 w-3.5" />Blocked
        </Button>
      )}
      {epic.uiStatus === 'ready' && (
        <Button className="gap-2 shrink-0" onClick={onStartSession}>
          <Play className="h-3.5 w-3.5" />Start Session
        </Button>
      )}
      {epic.uiStatus === 'in_progress' && (
        <Button variant="secondary" className="gap-2 shrink-0" onClick={onViewSession}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />View Session
        </Button>
      )}
      {epic.uiStatus === 'in_review' && (
        <Button className="gap-2 shrink-0" onClick={onReviewPR}>
          <GitPullRequest className="h-3.5 w-3.5" />Review PR
        </Button>
      )}
      {epic.uiStatus === 'done' && (
        <Button variant="secondary" className="gap-2 shrink-0" onClick={() => toast.info('Viewing completed epic')}>
          <Eye className="h-3.5 w-3.5" />View Summary
        </Button>
      )}

      <Button variant="outline" className="gap-2 shrink-0" onClick={() => toast.info('Edit mode')}>
        <Pencil className="h-3.5 w-3.5" />Edit
      </Button>
      <Button variant="ghost" className="gap-2 shrink-0 text-ink-muted" onClick={onDefer}>
        <CalendarClock className="h-3.5 w-3.5" />Defer
      </Button>
      {epic.uiStatus === 'done'
        ? <Button variant="ghost" className="gap-2 shrink-0 text-ink-muted" onClick={onReopen}><RotateCcw className="h-3.5 w-3.5" />Reopen</Button>
        : <Button variant="ghost" className="gap-2 shrink-0 text-ink-muted" onClick={onClose}><CheckCircle2 className="h-3.5 w-3.5" />Close</Button>}
      <Button variant="ghost" className="gap-2 shrink-0 text-error hover:text-error" onClick={onArchive}>
        <Archive className="h-3.5 w-3.5" />Archive
      </Button>
    </div>
  )
}
