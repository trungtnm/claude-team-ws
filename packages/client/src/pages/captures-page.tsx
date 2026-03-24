import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Inbox, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useSocketRoom, useSocketEvent } from '@/hooks/use-socket'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

interface Capture {
  id: string
  project_id: string
  user_id: string
  text: string
  status: 'pending' | 'triaged' | 'deferred' | 'dismissed'
  triage_result: string | null
  created_at: number
  triaged_at: number | null
  triaged_by: string | null
}

interface CapturesResponse {
  captures: Capture[]
  total: number
}

type StatusFilter = 'pending' | 'deferred' | 'all'

export default function CapturesPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<StatusFilter>('pending')
  const [newCaptureOpen, setNewCaptureOpen] = useState(false)
  const [captureText, setCaptureText] = useState('')

  // Fetch captures
  const { data, isLoading } = useQuery({
    queryKey: ['captures', projectId, filter],
    queryFn: () => {
      const statusParam = filter === 'all' ? '' : `?status=${filter}`
      return api.get<CapturesResponse>(`/projects/${projectId}/captures${statusParam}`)
    },
    enabled: !!projectId,
  })

  // Socket.IO: join project room and invalidate on real-time events
  useSocketRoom(projectId ? `project:${projectId}` : undefined)
  useSocketEvent('capture:created', () => queryClient.invalidateQueries({ queryKey: ['captures', projectId] }))
  useSocketEvent('capture:updated', () => queryClient.invalidateQueries({ queryKey: ['captures', projectId] }))
  useSocketEvent('capture:deleted', () => queryClient.invalidateQueries({ queryKey: ['captures', projectId] }))

  // Create capture mutation
  const createCapture = useMutation({
    mutationFn: (text: string) =>
      api.post<{ capture: Capture }>(`/projects/${projectId}/captures`, { text }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
      setCaptureText('')
      setNewCaptureOpen(false)
      toast.success('Capture created')
    },
    onError: (err) => toast.error(err.message),
  })

  // Dismiss capture mutation
  const dismissCapture = useMutation({
    mutationFn: (captureId: string) =>
      api.delete(`/projects/${projectId}/captures/${captureId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
      toast.success('Capture dismissed')
    },
    onError: (err) => toast.error(err.message),
  })

  // Triage capture mutation
  const triageCapture = useMutation({
    mutationFn: ({ captureId, status, triage_result }: {
      captureId: string
      status: string
      triage_result?: unknown
    }) => api.patch(`/projects/${projectId}/captures/${captureId}`, { status, triage_result }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['captures', projectId] })
      toast.success('Capture triaged')
    },
    onError: (err) => toast.error(err.message),
  })

  const captures = data?.captures || []
  const total = data?.total || 0

  const tabs: { key: StatusFilter; label: string }[] = [
    { key: 'pending', label: 'Pending' },
    { key: 'deferred', label: 'Deferred' },
    { key: 'all', label: 'All' },
  ]

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Inbox className="h-6 w-6 text-accent" />
          <h1 className="text-2xl font-semibold text-ink">Captures</h1>
          <Badge className="bg-accent-muted text-accent">{total}</Badge>
        </div>

        <Dialog open={newCaptureOpen} onOpenChange={setNewCaptureOpen}>
          <DialogTrigger asChild>
            <Button className="bg-accent hover:bg-accent-hover text-surface-base">
              <Plus className="h-4 w-4 mr-2" />
              New Capture
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-surface-raised border-edge">
            <DialogHeader>
              <DialogTitle className="text-ink">New Capture</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                value={captureText}
                onChange={(e) => setCaptureText(e.target.value)}
                placeholder="Describe your idea, bug, or feature request..."
                className="min-h-[120px] bg-surface-base border-edge text-ink placeholder:text-ink-muted"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setNewCaptureOpen(false)}
                  className="border-edge text-ink-secondary">
                  Cancel
                </Button>
                <Button
                  className="bg-accent hover:bg-accent-hover text-surface-base"
                  onClick={() => createCapture.mutate(captureText)}
                  disabled={!captureText.trim() || createCapture.isPending}
                >
                  {createCapture.isPending ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-6 p-1 bg-surface-raised rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-4 py-1.5 rounded-md text-sm font-medium transition-colors',
              filter === tab.key
                ? 'bg-surface-elevated text-ink'
                : 'text-ink-muted hover:text-ink-secondary',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Captures list */}
      {isLoading ? (
        <div className="flex flex-col items-center py-12 gap-2">
          <div className="relative h-6 w-6">
            <div className="absolute inset-0 rounded-full border-2 border-edge" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
          </div>
          <span className="text-xs text-ink-disabled">Loading captures</span>
        </div>
      ) : captures.length === 0 ? (
        <div className="text-center py-12">
          <Inbox className="h-12 w-12 text-ink-disabled mx-auto mb-3" />
          <p className="text-ink-muted">No captures yet</p>
          <p className="text-ink-disabled text-sm mt-1">Create one with the button above or Cmd+J</p>
        </div>
      ) : (
        <div className="space-y-3">
          {captures.map((capture) => (
            <Card
              key={capture.id}
              className="p-4 bg-surface-raised border-edge hover:border-edge-hover transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-ink text-sm whitespace-pre-wrap">{capture.text}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge
                      className={cn(
                        'text-xs',
                        capture.status === 'pending' && 'bg-warning/15 text-warning',
                        capture.status === 'triaged' && 'bg-success/15 text-success',
                        capture.status === 'deferred' && 'bg-ink-muted/15 text-ink-muted',
                      )}
                    >
                      {capture.status}
                    </Badge>
                    <span className="text-xs text-ink-disabled">
                      {new Date(capture.created_at * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {capture.status === 'pending' && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-edge text-ink-secondary hover:text-accent hover:border-accent"
                      onClick={() => triageCapture.mutate({
                        captureId: capture.id,
                        status: 'triaged',
                        triage_result: { type: 'quick-fix' },
                      })}
                    >
                      Quick Fix
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs bg-accent/15 text-accent hover:bg-accent/25"
                      onClick={() => triageCapture.mutate({
                        captureId: capture.id,
                        status: 'triaged',
                        triage_result: {
                          type: 'epic',
                          title: capture.text.slice(0, 80),
                          priority: 2,
                        },
                      })}
                    >
                      Create Epic
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-ink-disabled hover:text-error"
                      onClick={() => dismissCapture.mutate(capture.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
