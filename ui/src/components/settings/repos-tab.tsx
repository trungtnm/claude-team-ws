import { useState } from 'react'
import { Package, MoreVertical, Plus, GitBranch, ArrowDownToLine, Terminal, Trash2, GitFork, Copy, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { AddRepoDialog } from '@/components/settings/add-repo-dialog'
import { repos, type Repo } from '@/data/repos'

const statusConfig: Record<Repo['status'], { label: string; variant: 'success' | 'warning' | 'error' }> = {
  ready: { label: 'Ready', variant: 'success' },
  cloning: { label: 'Cloning', variant: 'warning' },
  error: { label: 'Error', variant: 'error' },
}

type SyncStatus = 'synced' | 'behind' | 'diverged'

/** Simulated sync status per repo */
const syncStatusMap: Record<string, { status: SyncStatus; behindBy?: number }> = {
  'repo-1': { status: 'synced' },
  'repo-2': { status: 'behind', behindBy: 3 },
  'repo-3': { status: 'diverged' },
  'repo-4': { status: 'synced' },
  'repo-5': { status: 'synced' },
  'repo-6': { status: 'behind', behindBy: 1 },
}

const syncStatusConfig: Record<SyncStatus, { label: string; className: string }> = {
  synced: { label: 'Synced', className: 'text-green-400' },
  behind: { label: 'Behind', className: 'text-amber-400' },
  diverged: { label: 'Diverged', className: 'text-red-400' },
}

function RepoCard({ repo }: { repo: Repo }) {
  const status = statusConfig[repo.status]
  const linkModeLabel = repo.linkMode === 'clone' ? 'Cloned' : 'Linked'
  const displayUrl = repo.gitUrl || repo.path
  const sync = syncStatusMap[repo.id] ?? { status: 'synced' as SyncStatus }
  const syncConfig = syncStatusConfig[sync.status]

  const handlePull = () => {
    toast.success(`Pulling latest for ${repo.name}...`)
  }

  const handleViewBranches = () => {
    toast.info(`Viewing branches for ${repo.name}`)
  }

  const handleOpenTerminal = () => {
    toast.info(`Opening terminal at ${repo.path}`)
  }

  const handleRemove = () => {
    toast.error(`Removed repository ${repo.name}`)
  }

  const handleCopyPath = () => {
    navigator.clipboard.writeText(repo.path).catch(() => {})
    toast.success(`Path copied: ${repo.path}`)
  }

  const handleSwitchBranch = () => {
    toast.info('Branch switcher coming soon')
  }

  const syncLabel = sync.status === 'behind' && sync.behindBy
    ? `Behind by ${sync.behindBy} commits`
    : syncConfig.label

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3 min-w-0">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-surface-elevated">
            <Package className="h-4 w-4 text-ink-secondary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{repo.name}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
              <span className={cn('text-xs', syncConfig.className)}>
                {syncLabel}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-xs text-ink-muted">{displayUrl}</p>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handlePull}>
              <ArrowDownToLine className="h-4 w-4" />
              Pull latest
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleViewBranches}>
              <GitFork className="h-4 w-4" />
              View branches
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSwitchBranch}>
              <GitBranch className="h-4 w-4" />
              Switch branch
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyPath}>
              <Copy className="h-4 w-4" />
              Copy path
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleOpenTerminal}>
              <Terminal className="h-4 w-4" />
              Open in terminal
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleRemove} className="text-error hover:text-error">
              <Trash2 className="h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span className="flex items-center gap-1">
          <GitBranch className="h-3 w-3" />
          {repo.defaultBranch}
        </span>
        <span>{linkModeLabel}</span>
        {repo.uncommittedCount > 0 && (
          <Badge variant="warning" className="text-[10px] px-1.5 py-0">
            {repo.uncommittedCount} uncommitted
          </Badge>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 text-xs text-ink-muted">
        <span className="font-mono">{repo.lastCommit.sha.slice(0, 7)}</span>
        <span className="truncate">{repo.lastCommit.message}</span>
        <span className="shrink-0">&middot;</span>
        <span className="shrink-0">{repo.lastCommit.author}</span>
        <span className="shrink-0">&middot;</span>
        <span className="shrink-0">
          {formatDistanceToNow(repo.lastCommit.time * 1000, { addSuffix: true })}
        </span>
      </div>
    </Card>
  )
}

export function ReposTab() {
  const [repoList] = useState(repos)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  const handlePullAll = () => {
    toast.success('Pulling all repositories...')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{repoList.length} repositories configured</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" size="sm" onClick={handlePullAll}>
            <RefreshCw className="h-4 w-4" />
            Pull All
          </Button>
          <Button className="gap-2" size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Repo
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {repoList.map((repo) => (
          <RepoCard key={repo.id} repo={repo} />
        ))}
      </div>

      {/* Footer */}
      <p className="text-xs text-ink-muted">
        Repositories are the working directories agents use. Each session checks out an epic-specific branch.
      </p>

      <AddRepoDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </div>
  )
}
