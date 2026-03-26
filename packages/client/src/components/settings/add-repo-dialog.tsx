import { useState } from 'react'
import { Folder, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useAddRepo } from '@/hooks/use-settings'

type LinkMode = 'clone' | 'link'

interface AddRepoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AddRepoDialog({ open, onOpenChange }: AddRepoDialogProps) {
  const [mode, setMode] = useState<LinkMode>('clone')
  const [name, setName] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [path, setPath] = useState('')
  const [branch, setBranch] = useState('main')
  const addRepo = useAddRepo()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Repository name is required')
      return
    }

    if (mode === 'clone' && !gitUrl.trim()) {
      toast.error('Git URL is required')
      return
    }

    if (mode === 'link' && !path.trim()) {
      toast.error('Path is required')
      return
    }

    addRepo.mutate(
      {
        name: name.trim(),
        gitUrl: mode === 'clone' ? gitUrl.trim() : undefined,
        path: mode === 'link' ? path.trim() : `/tmp/repos/${name.trim()}`,
        defaultBranch: branch.trim() || 'main',
        linkMode: mode === 'link' ? 'symlink' : 'clone',
      },
      {
        onSuccess: () => {
          toast.success('Repository added')
          resetForm()
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const resetForm = () => {
    setName('')
    setGitUrl('')
    setPath('')
    setBranch('main')
    setMode('clone')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Repository</DialogTitle>
          <DialogDescription>
            Clone a remote repository or link an existing local directory.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-[var(--radius-md)] border border-edge p-0.5">
            <button
              type="button"
              onClick={() => setMode('clone')}
              className={cn(
                'flex-1 rounded-[var(--radius-sm)] py-1.5 text-sm font-medium transition-colors',
                mode === 'clone'
                  ? 'bg-surface-elevated text-ink'
                  : 'text-ink-muted hover:text-ink-secondary',
              )}
            >
              Clone from URL
            </button>
            <button
              type="button"
              onClick={() => setMode('link')}
              className={cn(
                'flex-1 rounded-[var(--radius-sm)] py-1.5 text-sm font-medium transition-colors',
                mode === 'link'
                  ? 'bg-surface-elevated text-ink'
                  : 'text-ink-muted hover:text-ink-secondary',
              )}
            >
              Link existing
            </button>
          </div>

          {/* Name */}
          <div>
            <label htmlFor="repo-name" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Name
            </label>
            <Input
              id="repo-name"
              placeholder="my-project"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Clone mode: Git URL */}
          {mode === 'clone' && (
            <div>
              <label htmlFor="repo-url" className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Git URL
              </label>
              <Input
                id="repo-url"
                placeholder="git@github.com:org/repo.git"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
              />
            </div>
          )}

          {/* Link mode: Path */}
          {mode === 'link' && (
            <div>
              <label htmlFor="repo-path" className="mb-1.5 block text-xs font-medium text-ink-secondary">
                Path
              </label>
              <div className="relative">
                <Folder className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <Input
                  id="repo-path"
                  className="pl-9"
                  placeholder="/Users/dev/my-project"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Branch */}
          <div>
            <label htmlFor="repo-branch" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Branch
            </label>
            <Input
              id="repo-branch"
              placeholder="main"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addRepo.isPending}>
              {addRepo.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Repository
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
