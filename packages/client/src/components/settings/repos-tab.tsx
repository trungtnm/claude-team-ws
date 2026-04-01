import { useState } from 'react'
import { Package, MoreVertical, Plus, GitBranch, ArrowDownToLine, Trash2, GitFork, Copy, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
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
import { useRepos, usePullRepo, useRemoveRepo } from '@/hooks/use-settings'
import type { Repo } from '@/types'

const statusConfig: Record<Repo['status'], { label: string; variant: 'success' | 'warning' | 'error' }> = {
  ready: { label: 'Ready', variant: 'success' },
  cloning: { label: 'Cloning', variant: 'warning' },
  error: { label: 'Error', variant: 'error' },
}

function RepoCard({ repo }: { repo: Repo }) {
  const status = statusConfig[repo.status]
  const linkModeLabel = repo.linkMode === 'clone' ? 'Cloned' : 'Linked'
  const displayUrl = repo.gitUrl || repo.path
  const pullRepo = usePullRepo()
  const removeRepo = useRemoveRepo()
  const [showBranches, setShowBranches] = useState(false)
  const [branches, setBranches] = useState<Array<{ name: string; isDefault: boolean }>>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const handlePull = () => {
    pullRepo.mutate(repo.name, {
      onSuccess: (data) => {
        const result = data as { result: string; newCommits: number }
        toast.success(result.newCommits > 0
          ? `Pulled ${result.newCommits} new commit(s) for ${repo.name}`
          : `${repo.name} is up to date`)
      },
      onError: (err) => toast.error(err.message),
    })
  }

  const handleViewBranches = async () => {
    setBranchesLoading(true)
    try {
      const { reposApi } = await import('@/lib/resources')
      const data = await reposApi.branches(repo.projectId, repo.name)
      setBranches(data.branches ?? [])
      setShowBranches(true)
    } catch (err) {
      toast.error(`Failed to fetch branches: ${err instanceof Error ? err.message : 'Unknown'}`)
    } finally {
      setBranchesLoading(false)
    }
  }

  const handleSwitchBranch = async (branchName: string) => {
    try {
      const { api } = await import('@/lib/api')
      await api.post(`/projects/${repo.projectId}/repos/${repo.name}/checkout`, { branch: branchName })
      toast.success(`Switched ${repo.name} to ${branchName}`)
      setShowBranches(false)
    } catch (err) {
      toast.error(`Failed to switch branch: ${err instanceof Error ? err.message : 'Unknown'}`)
    }
  }

  const handleRemove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    removeRepo.mutate(repo.name, {
      onSuccess: () => toast.success(`Removed repository ${repo.name}`),
      onError: (err) => toast.error(err.message),
    })
    setConfirmRemove(false)
  }

  const handleCopyPath = () => {
    navigator.clipboard.writeText(repo.path).catch(() => {})
    toast.success(`Path copied: ${repo.path}`)
  }

  // Show warning badge if repo claims ready but might not exist
  const showPathWarning = repo.status === 'ready' && repo.linkMode === 'clone'

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
            <DropdownMenuItem onClick={handlePull} disabled={pullRepo.isPending}>
              {pullRepo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
              Pull latest
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleViewBranches} disabled={branchesLoading}>
              {branchesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitFork className="h-4 w-4" />}
              View branches
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopyPath}>
              <Copy className="h-4 w-4" />
              Copy path
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-error hover:text-error"
              disabled={removeRepo.isPending}
            >
              <Trash2 className="h-4 w-4" />
              {confirmRemove ? 'Confirm remove?' : 'Remove'}
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
        {showPathWarning && (
          <span className="flex items-center gap-1 text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            Verify path exists
          </span>
        )}
      </div>

      {/* Branch list panel */}
      {showBranches && branches.length > 0 && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-edge bg-surface-base p-2 space-y-0.5">
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-medium text-ink-secondary">Branches ({branches.length})</span>
            <button type="button" onClick={() => setShowBranches(false)} className="text-[10px] text-ink-muted hover:text-ink-secondary cursor-pointer">Close</button>
          </div>
          {branches.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => handleSwitchBranch(b.name)}
              className="flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-xs text-ink-secondary hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <GitBranch className="h-3 w-3 shrink-0" />
              <span className="truncate">{b.name}</span>
              {b.isDefault && <Badge variant="default" className="ml-auto text-[9px] px-1 py-0">default</Badge>}
            </button>
          ))}
        </div>
      )}
    </Card>
  )
}

export function ReposTab() {
  const { data: repoList, isLoading } = useRepos()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const pullRepo = usePullRepo()

  const handlePullAll = () => {
    if (!repoList) return
    for (const repo of repoList) {
      if (repo.status === 'ready') {
        pullRepo.mutate(repo.name)
      }
    }
    toast.success('Pulling all repositories...')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    )
  }

  const repos = repoList ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{repos.length} repositories configured</p>
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
        {repos.map((repo) => (
          <RepoCard key={repo.id} repo={repo} />
        ))}
        {repos.length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-8 text-center">
            <p className="text-sm text-ink-muted">No repositories configured. Add one to get started.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-ink-muted">
        Repositories are the working directories agents use. Each session checks out an epic-specific branch.
      </p>

      <AddRepoDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </div>
  )
}
