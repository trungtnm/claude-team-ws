import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface Project {
  id: string
  name: string
  slug: string
  project_root: string
  max_concurrent_agents: number
  ask_question_mode: 'pause' | 'auto' | 'hybrid'
  created_at: number
  updated_at: number
}

export function ProjectTab() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [maxAgents, setMaxAgents] = useState<number | null>(null)
  const [qMode, setQMode] = useState<string | null>(null)

  const { data: project } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await api.get<{ project: Project }>(`/projects/${projectId}`)
      return res.project
    },
    enabled: !!projectId,
  })

  const updateProject = useMutation({
    mutationFn: (updates: Partial<Project>) =>
      api.patch(`/projects/${projectId}`, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] })
      toast.success('Project updated')
    },
    onError: (err) => toast.error(err.message),
  })

  if (!project) return null

  return (
    <div className="space-y-6 py-4 max-w-2xl">
      {/* Identity */}
      <Card className="p-6 bg-surface-raised border-edge">
        <h3 className="text-sm font-medium text-ink mb-4">Project Identity</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Name</label>
            <p className="text-sm text-ink">{project.name}</p>
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Slug</label>
            <Badge variant="outline" className="font-mono">{project.slug}</Badge>
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">Project Root</label>
            <code className="text-xs text-ink-muted bg-surface-base px-2 py-1 rounded">{project.project_root}</code>
          </div>
          <div>
            <label className="text-xs text-ink-muted block mb-1">ID</label>
            <code className="text-xs text-ink-disabled">{project.id}</code>
          </div>
        </div>
      </Card>

      {/* Agent Configuration */}
      <Card className="p-6 bg-surface-raised border-edge">
        <h3 className="text-sm font-medium text-ink mb-4">Agent Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-ink-muted block mb-1">Max Concurrent Agents</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={10}
                value={maxAgents ?? project.max_concurrent_agents}
                onChange={(e) => setMaxAgents(parseInt(e.target.value))}
                className="w-20 bg-surface-base border-edge text-ink"
              />
              <Button
                size="sm"
                disabled={maxAgents === null || maxAgents === project.max_concurrent_agents}
                onClick={() => {
                  if (maxAgents !== null) updateProject.mutate({ max_concurrent_agents: maxAgents })
                }}
              >
                Save
              </Button>
            </div>
          </div>

          <div>
            <label className="text-xs text-ink-muted block mb-1">AskUserQuestion Mode</label>
            <div className="flex items-center gap-2">
              <Select
                value={qMode ?? project.ask_question_mode}
                onValueChange={(v) => setQMode(v)}
              >
                <SelectTrigger className="w-40 bg-surface-base border-edge text-ink">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pause">Pause (always ask human)</SelectItem>
                  <SelectItem value="auto">Auto (AI decides)</SelectItem>
                  <SelectItem value="hybrid">Hybrid (auto low-risk)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                disabled={qMode === null || qMode === project.ask_question_mode}
                onClick={() => {
                  if (qMode !== null) updateProject.mutate({ ask_question_mode: qMode as Project['ask_question_mode'] })
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
