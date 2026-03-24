import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { GitBranch, Plus, RefreshCw, Trash2, Link, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Repo {
  id: string
  name: string
  path: string
  git_url: string | null
  default_branch: string
  link_mode: 'clone' | 'symlink'
  status: string
  current_branch?: string
  last_commit?: { hash: string; message: string; date: string }
}

export function ReposTab() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [addOpen, setAddOpen] = useState(false)
  const [mode, setMode] = useState<'clone' | 'link'>('clone')
  const [name, setName] = useState('')
  const [gitUrl, setGitUrl] = useState('')
  const [sourcePath, setSourcePath] = useState('')

  const { data, isLoading } = useQuery<{ repos: Repo[] }>({
    queryKey: ['repos', projectId],
    queryFn: () => api.get(`/projects/${projectId}/repos`),
    enabled: !!projectId,
  })

  const addRepo = useMutation({
    mutationFn: (body: unknown) => api.post(`/projects/${projectId}/repos`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos', projectId] })
      setAddOpen(false)
      setName('')
      setGitUrl('')
      setSourcePath('')
      toast.success('Repository added')
    },
    onError: (err) => toast.error(err.message),
  })

  const pullRepo = useMutation({
    mutationFn: (repoName: string) => api.post(`/projects/${projectId}/repos/${repoName}/pull`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos', projectId] })
      toast.success('Pulled latest changes')
    },
    onError: (err) => toast.error(err.message),
  })

  const removeRepo = useMutation({
    mutationFn: (repoName: string) =>
      api.delete(`/projects/${projectId}/repos/${repoName}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['repos', projectId] })
      toast.success('Repository removed')
    },
    onError: (err) => toast.error(err.message),
  })

  const repos = data?.repos ?? []

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">{repos.length} repositories</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Repo</Button>
          </DialogTrigger>
          <DialogContent className="bg-surface-raised border-edge">
            <DialogHeader>
              <DialogTitle className="text-ink">Add Repository</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={mode} onValueChange={(v) => setMode(v as 'clone' | 'link')}>
                <SelectTrigger className="bg-surface-base border-edge text-ink"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clone">Clone from URL</SelectItem>
                  <SelectItem value="link">Link existing directory</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Repo name (e.g. backend)" value={name} onChange={(e) => setName(e.target.value)} className="bg-surface-base border-edge text-ink" />
              {mode === 'clone' ? (
                <Input placeholder="git@github.com:team/repo.git" value={gitUrl} onChange={(e) => setGitUrl(e.target.value)} className="bg-surface-base border-edge text-ink" />
              ) : (
                <Input placeholder="/Users/dev/existing-repo" value={sourcePath} onChange={(e) => setSourcePath(e.target.value)} className="bg-surface-base border-edge text-ink" />
              )}
              <Button className="w-full" disabled={!name.trim() || addRepo.isPending}
                onClick={() => addRepo.mutate(mode === 'clone'
                  ? { mode: 'clone', name, git_url: gitUrl, default_branch: 'main' }
                  : { mode: 'link', name, source_path: sourcePath, default_branch: 'main' }
                )}>
                {addRepo.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Add Repository
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-ink-muted">Loading...</div>
      ) : repos.length === 0 ? (
        <div className="text-center py-12">
          <GitBranch className="h-10 w-10 mx-auto mb-2 text-ink-disabled" />
          <p className="text-ink-muted">No repositories yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {repos.map((repo) => (
            <Card key={repo.id} className="p-4 bg-surface-raised border-edge">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {repo.link_mode === 'symlink' ? <Link className="h-4 w-4 text-ink-muted" /> : <GitBranch className="h-4 w-4 text-ink-muted" />}
                  <div>
                    <p className="text-sm font-medium text-ink">{repo.name}</p>
                    <p className="text-xs text-ink-disabled font-mono">{repo.current_branch ?? repo.default_branch}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">{repo.link_mode}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => pullRepo.mutate(repo.name)} disabled={pullRepo.isPending}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="text-error hover:text-error" onClick={() => {
                    if (confirm(`Remove '${repo.name}'?`)) removeRepo.mutate(repo.name)
                  }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
