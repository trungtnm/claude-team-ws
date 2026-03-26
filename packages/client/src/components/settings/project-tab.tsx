import { useState, useEffect, useCallback } from 'react'
import { Camera, Save, Copy, Check, Download, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useProjectSettings, useUpdateProject } from '@/hooks/use-settings'
import { useProject } from '@/providers/project-provider'
import { healthApi } from '@/lib/resources'
import type { AskQuestionMode } from '@/types'

const askQuestionModes = [
  { value: 'pause', label: 'Pause', description: 'Agent stops and waits for human answer' },
  { value: 'auto', label: 'Auto-decide', description: 'Agent picks the best option itself' },
  { value: 'hybrid', label: 'Hybrid', description: 'Auto-decide for low-risk, pause for high-risk' },
]

interface IntegrationStatus {
  name: string
  detail: string
  status: 'connected' | 'disconnected' | 'not-found'
}

const defaultIntegrations: IntegrationStatus[] = [
  { name: 'Agent Mail', detail: 'port 8765', status: 'connected' },
  { name: 'Context Manager (CM)', detail: 'port 9900', status: 'connected' },
  { name: 'CASS', detail: 'CLI tool', status: 'not-found' },
]

function getStatusDisplay(status: IntegrationStatus['status']): { dotClass: string; label: string; labelClass: string } {
  switch (status) {
    case 'connected':
      return { dotClass: 'bg-green-400', label: 'Connected', labelClass: 'text-green-400' }
    case 'disconnected':
      return { dotClass: 'bg-red-400', label: 'Disconnected', labelClass: 'text-red-400' }
    case 'not-found':
      return { dotClass: 'bg-yellow-400', label: 'Not found', labelClass: 'text-yellow-400' }
  }
}

export function ProjectTab() {
  const { projectId } = useProject()
  const { data: project, isLoading } = useProjectSettings()
  const updateProject = useUpdateProject()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [maxAgents, setMaxAgents] = useState('3')
  const [askMode, setAskMode] = useState<AskQuestionMode>('hybrid')
  const [copied, setCopied] = useState(false)
  const [integrationStatuses, setIntegrationStatuses] = useState(defaultIntegrations)
  const [integrationsLoading, setIntegrationsLoading] = useState(false)
  const [formInitialized, setFormInitialized] = useState(false)

  // Sync form state only on first load (not on every refetch)
  useEffect(() => {
    if (project && !formInitialized) {
      setName(project.name)
      setDescription('') // Description not yet in DB — show empty for now
      setMaxAgents(String(project.maxConcurrentAgents))
      setAskMode(project.askQuestionMode)
      setFormInitialized(true)
    }
  }, [project, formInitialized])

  const handleSave = () => {
    updateProject.mutate(
      {
        name: name.trim(),
        maxConcurrentAgents: parseInt(maxAgents, 10) || 3,
        askQuestionMode: askMode,
      },
      {
        onSuccess: () => toast.success('Project settings saved'),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleCopyId = () => {
    navigator.clipboard.writeText(projectId).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleExportData = () => {
    toast.success('Generating export... Download will start shortly')
  }


  const fetchIntegrationStatus = useCallback(async () => {
    setIntegrationsLoading(true)
    try {
      const data = await healthApi.diagnostics()
      const statuses: IntegrationStatus[] = [
        {
          name: 'Agent Mail',
          detail: 'port 8765',
          status: data.dockerServices.agentMail ? 'connected' : 'disconnected',
        },
        {
          name: 'Context Manager (CM)',
          detail: 'port 9900',
          status: data.dockerServices.cm ? 'connected' : 'disconnected',
        },
        {
          name: 'CASS',
          detail: 'CLI tool',
          status: data.cliTools.cass ? 'connected' : 'not-found',
        },
      ]
      setIntegrationStatuses(statuses)
    } catch {
      toast.error('Failed to fetch integration status')
    } finally {
      setIntegrationsLoading(false)
    }
  }, [])

  // Fetch integration status on mount
  useEffect(() => {
    fetchIntegrationStatus()
  }, [fetchIntegrationStatus])

  const handleRefreshIntegrations = () => {
    fetchIntegrationStatus()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      {/* Project identity */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Project Identity</h3>

        {/* Avatar / picture */}
        <div className="flex items-center gap-5">
          <div className="relative group">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-surface-base">
              {name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'CT'}
            </div>
            <button
              type="button"
              onClick={() => toast.info('Upload project picture')}
              className={cn(
                'absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer',
              )}
            >
              <Camera className="h-5 w-5 text-white" />
            </button>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-ink">Project picture</p>
            <p className="text-xs text-ink-muted">Displayed in the header and project selector. Recommended 256x256px.</p>
            <div className="flex items-center gap-2 mt-1">
              <Button variant="outline" size="sm" className="text-xs" onClick={() => toast.info('Upload project picture')}>
                Upload
              </Button>
              <Button variant="ghost" size="sm" className="text-xs text-ink-muted" onClick={() => toast('Picture removed')}>
                Remove
              </Button>
            </div>
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Project name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
          <p className="mt-1 text-[11px] text-ink-muted">Used in the header, notifications, and agent context.</p>
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Description</label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="max-w-lg" />
          <p className="mt-1 text-[11px] text-ink-muted">Brief summary of the project. Injected into agent session context.</p>
        </div>

        {/* Project ID */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Project ID</label>
          <div className="flex items-center gap-2">
            <code className="rounded-[var(--radius-md)] border border-edge bg-surface-base px-3 py-1.5 text-xs font-mono text-ink-muted">{projectId}</code>
            <button
              type="button"
              onClick={handleCopyId}
              aria-label="Copy project ID"
              className="rounded-[var(--radius-sm)] p-1.5 text-ink-muted hover:text-ink hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* Slug */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Slug</label>
          <code className="rounded-[var(--radius-md)] border border-edge bg-surface-base px-3 py-1.5 text-xs font-mono text-ink-muted">{project?.slug ?? ''}</code>
          <p className="mt-1 text-[11px] text-ink-muted">Auto-generated from name. Used in URLs.</p>
        </div>
      </section>

      <Separator />

      {/* Workspace paths */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Workspace</h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Project root path</label>
          <Input value={project?.projectRoot ?? ''} disabled className="max-w-lg font-mono text-xs opacity-60" />
          <p className="mt-1 text-[11px] text-ink-muted">Absolute path to the git root. Agents spawn with this as their working directory.</p>
        </div>
      </section>

      <Separator />

      {/* Agent configuration */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Agent Configuration</h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Max concurrent agents</label>
          <Input
            type="number"
            min="1"
            max="10"
            value={maxAgents}
            onChange={(e) => setMaxAgents(e.target.value)}
            className="w-20"
          />
          <p className="mt-1 text-[11px] text-ink-muted">How many agent sessions can run simultaneously. Excess requests are queued.</p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-secondary">AskUserQuestion mode</label>
          <p className="mb-2 text-[11px] text-ink-muted">How agents handle questions during execution.</p>
          <div className="flex flex-col gap-2 max-w-sm">
            {askQuestionModes.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setAskMode(mode.value as AskQuestionMode)}
                className={cn(
                  'flex items-start gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-all cursor-pointer',
                  askMode === mode.value
                    ? 'border-accent/40 bg-accent-muted'
                    : 'border-edge hover:bg-surface-elevated',
                )}
              >
                <div className={cn(
                  'mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition-colors',
                  askMode === mode.value ? 'border-accent bg-accent' : 'border-edge',
                )} />
                <div>
                  <span className={cn('text-xs font-medium', askMode === mode.value ? 'text-accent' : 'text-ink-secondary')}>
                    {mode.label}
                  </span>
                  <p className={cn('text-[11px] mt-0.5', askMode === mode.value ? 'text-accent/70' : 'text-ink-muted')}>
                    {mode.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <Separator />

      {/* Integrations */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Integrations</h3>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={handleRefreshIntegrations} disabled={integrationsLoading}>
            {integrationsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Refresh status
          </Button>
        </div>

        <div className="space-y-2">
          {integrationStatuses.map((integration) => {
            const display = getStatusDisplay(integration.status)
            return (
              <div
                key={integration.name}
                className="flex items-center justify-between rounded-[var(--radius-md)] border border-edge px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className={cn('inline-block h-2.5 w-2.5 rounded-full', display.dotClass)} />
                  <span className="text-sm text-ink">{integration.name}</span>
                </div>
                <span className={cn('text-xs', display.labelClass)}>
                  {display.label}
                  {integration.status === 'connected' && ` \u00b7 ${integration.detail}`}
                  {integration.status === 'not-found' && integration.name === 'CASS' && ' \u00b7 Not installed'}
                </span>
              </div>
            )
          })}
        </div>
      </section>

      <Separator />

      {/* Export data */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-ink">Data</h3>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-ink">Export project data</p>
            <p className="text-xs text-ink-muted">Export all project data as JSON (captures, epics, sessions, rules)</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportData}>
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </section>


      {/* Save button */}
      <div className="flex items-center gap-3 pb-4">
        <Button onClick={handleSave} className="gap-2" disabled={updateProject.isPending}>
          {updateProject.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Save Changes
        </Button>
        {project?.updatedAt && (
          <Badge variant="outline" className="text-[10px]">
            Last saved {new Date(project.updatedAt * 1000).toLocaleString()}
          </Badge>
        )}
      </div>
    </div>
  )
}
