import { useState } from 'react'
import { toast } from 'sonner'
import {
  CheckCircle2, Circle, Loader2, Ban, Clock, Play,
  UserPlus, Link2, Plus, X, MessageSquare, Send, Tag,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import type { Bead, BeadStatus } from '@/types'
import { getInitials, getUserColor } from '@/lib/user-utils'
import { useMembers } from '@/hooks/use-settings'

const statusConfig: Record<BeadStatus, { icon: typeof Circle; className: string; label: string }> = {
  done: { icon: CheckCircle2, className: 'text-green-400 bg-green-400/10', label: 'Done' },
  open: { icon: Circle, className: 'text-ink-muted bg-surface-elevated', label: 'Open' },
  in_progress: { icon: Loader2, className: 'text-blue-400 bg-blue-400/10', label: 'In Progress' },
  blocked: { icon: Ban, className: 'text-red-400 bg-red-400/10', label: 'Blocked' },
}

const priorityConfig: Record<number, { className: string; label: string }> = {
  0: { className: 'bg-red-500/15 text-red-400', label: 'P0 Critical' },
  1: { className: 'bg-blue-500/15 text-blue-400', label: 'P1 High' },
  2: { className: 'bg-yellow-500/15 text-yellow-400', label: 'P2 Medium' },
  3: { className: 'bg-gray-500/15 text-gray-400', label: 'P3 Low' },
}

const typeConfig: Record<string, string> = {
  task: 'text-green-400 bg-green-400/10',
  bug: 'text-red-400 bg-red-400/10',
  spike: 'text-purple-400 bg-purple-400/10',
}

interface BeadDetailDialogProps {
  bead: Bead | null
  allBeads?: Bead[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatTimestamp(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function BeadDetailDialog({ bead, allBeads = [], open, onOpenChange }: BeadDetailDialogProps) {
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)
  const { data: members = [] } = useMembers()

  if (!bead) return null

  const status = statusConfig[bead.status]
  const priority = priorityConfig[bead.priority] || priorityConfig[3]
  const assigneeMember = bead.assigneeId ? members.find((m) => m.userId === bead.assigneeId) : undefined
  const assignee = assigneeMember
    ? { name: assigneeMember.name, initials: getInitials(assigneeMember.name), color: getUserColor(assigneeMember.userId) }
    : undefined
  const StatusIcon = status.icon

  const dependencies = bead.dependencies.map((depId) => {
    const dep = allBeads.find((b) => b.id === depId)
    return dep ? { id: depId, title: dep.title, status: dep.status } : { id: depId, title: depId, status: 'open' as BeadStatus }
  })

  // === br-powered actions ===

  // br update <id> --status <status>
  const handleStatusChange = (newStatus: string) => toast.success(`Status → ${newStatus}`)

  // br update <id> --claim (assignee=actor + status=in_progress)
  const handleClaim = () => toast.success('Bead claimed — assigned to you, status set to In Progress')

  // br update <id> --assignee <user>
  const handleAssign = (name: string) => toast.success(`Assigned to ${name}`)

  // br update <id> --priority <p>
  const handlePriorityChange = (p: string) => toast.success(`Priority → ${p}`)

  // br dep add <bead> <depends-on>
  const handleAddDep = () => toast.success('Dependency added')

  // br dep remove <bead> <depends-on>
  const handleRemoveDep = (depId: string) => toast.success(`Dependency on ${depId} removed`)

  // br label add <id> <label>
  const handleAddLabel = () => toast.success('Label added')

  // br close <id> --reason <reason>
  const handleClose = () => { toast.success('Bead closed'); onOpenChange(false) }

  // br comments add <id> <text>
  const handleAddComment = () => {
    if (!commentText.trim()) return
    toast.success('Comment added')
    setCommentText('')
  }

  // Start agent session on this specific bead
  const handleStartSession = () => toast.success('Starting agent session for this bead...')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[70vw]">
        <DialogHeader>
          <code className="text-xs text-ink-muted font-mono">{bead.id}</code>
          <DialogTitle>{bead.title}</DialogTitle>
          <DialogDescription className="sr-only">Bead details: {bead.title}</DialogDescription>
        </DialogHeader>

        {/* Status + Priority + Type — all clickable to change */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status — br update --status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="cursor-pointer">
                <Badge className={cn(status.className, 'cursor-pointer gap-1')}>
                  <StatusIcon className={cn('h-3 w-3', bead.status === 'in_progress' && 'animate-spin')} />
                  {status.label}
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Change status</DropdownMenuLabel>
              {Object.entries(statusConfig).map(([key, cfg]) => (
                <DropdownMenuItem key={key} onClick={() => handleStatusChange(cfg.label)}>
                  <cfg.icon className={cn('h-3.5 w-3.5 mr-2', cfg.className.split(' ')[0])} />
                  {cfg.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Priority — br update --priority */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="cursor-pointer">
                <Badge className={cn(priority.className, 'cursor-pointer')}>{priority.label}</Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Change priority</DropdownMenuLabel>
              {Object.entries(priorityConfig).map(([key, cfg]) => (
                <DropdownMenuItem key={key} onClick={() => handlePriorityChange(cfg.label)}>
                  {cfg.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Badge className={cn(typeConfig[bead.type])}>{bead.type}</Badge>
        </div>

        <Separator />

        {/* Description */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Description</h4>
          <p className="text-sm leading-relaxed text-ink-secondary">{bead.description}</p>
        </div>

        {/* Dependencies — br dep list/add/remove */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Dependencies</h4>
            <button
              type="button"
              onClick={handleAddDep}
              className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-accent transition-colors cursor-pointer"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          {dependencies.length > 0 ? (
            <div className="space-y-1.5">
              {dependencies.map((dep) => {
                const depCfg = statusConfig[dep.status]
                const DepIcon = depCfg.icon
                return (
                  <div key={dep.id} className="flex items-center gap-2 text-sm group">
                    <DepIcon className={cn('h-3.5 w-3.5 shrink-0', depCfg.className.split(' ')[0])} />
                    <span className="text-ink-secondary flex-1">{dep.title}</span>
                    <code className="text-[10px] text-ink-muted font-mono">{dep.id}</code>
                    <button
                      type="button"
                      onClick={() => handleRemoveDep(dep.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-disabled hover:text-error transition-all cursor-pointer"
                      aria-label="Remove dependency"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-[11px] text-ink-disabled">No dependencies</p>
          )}
        </div>

        {/* Labels — br label add/remove */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Labels</h4>
          <div className="flex flex-wrap gap-1">
            {bead.labels.map((label) => (
              <Badge key={label} variant="outline" className="text-[11px] gap-1 group cursor-pointer" onClick={() => toast('Label removed')} aria-label={`Remove label ${label}`}>
                {label}
                <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 text-ink-muted" />
              </Badge>
            ))}
            <button
              type="button"
              onClick={handleAddLabel}
              className="flex items-center gap-0.5 rounded-full border border-dashed border-edge px-1.5 py-0 text-[10px] text-ink-disabled hover:text-ink-muted hover:border-edge-hover transition-colors cursor-pointer"
            >
              <Tag className="h-2.5 w-2.5" /> Add
            </button>
          </div>
        </div>

        {/* Assignee — br update --assignee / --claim */}
        <div>
          <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Assignee</h4>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                {assignee ? (
                  <>
                    <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: assignee.color }}>
                      {assignee.initials}
                    </div>
                    <span className="text-sm text-ink">{assignee.name}</span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm text-ink-muted">
                    <UserPlus className="h-3.5 w-3.5" /> Assign
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Assign to</DropdownMenuLabel>
              {members.map((u) => (
                <DropdownMenuItem key={u.userId} onClick={() => handleAssign(u.name)}>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white mr-2" style={{ backgroundColor: getUserColor(u.userId) }}>
                    {getInitials(u.name)}
                  </div>
                  {u.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleAssign('none')}>
                <X className="h-3.5 w-3.5 mr-2 text-ink-muted" /> Unassign
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Timestamps */}
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Created {formatTimestamp(bead.createdAt)}</span>
          <span>Updated {formatTimestamp(bead.updatedAt)}</span>
        </div>

        <Separator />

        {/* Comments — br comments */}
        <div>
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink-secondary transition-colors cursor-pointer"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Comments (0)
          </button>
          {showComments && (
            <div className="mt-2 flex items-center gap-2">
              <Input
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddComment() }}
                placeholder="Add a comment..."
                aria-label="Add a comment"
                className="h-8 text-xs flex-1"
              />
              <Button size="sm" variant="ghost" className="h-8 px-2" onClick={handleAddComment} disabled={!commentText.trim()} aria-label="Send comment">
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        <Separator />

        {/* Actions — status-aware primary action */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Primary action based on bead status */}
            {bead.status === 'open' && !bead.assigneeId && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleClaim}>
                <UserPlus className="h-3 w-3" /> Claim
              </Button>
            )}
            {bead.status === 'open' && bead.assigneeId && (
              <Button size="sm" className="gap-1.5" onClick={handleStartSession}>
                <Play className="h-3 w-3" /> Start Session
              </Button>
            )}
            {bead.status === 'in_progress' && (
              <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => toast.info('Viewing active session')}>
                <Loader2 className="h-3 w-3 animate-spin" /> In Progress
              </Button>
            )}
            {bead.status === 'blocked' && (
              <Button size="sm" variant="outline" className="gap-1.5 text-error border-error/30" disabled>
                <Ban className="h-3 w-3" /> Blocked
              </Button>
            )}
            {bead.status === 'done' && (
              <Button size="sm" variant="secondary" className="gap-1.5" disabled>
                <CheckCircle2 className="h-3 w-3 text-success" /> Completed
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className="gap-1.5 text-ink-muted" onClick={() => toast.info('Dependency tree view')}>
              <Link2 className="h-3 w-3" /> Dep tree
            </Button>
            {bead.status !== 'done' && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleClose}>
                <CheckCircle2 className="h-3 w-3" /> Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
