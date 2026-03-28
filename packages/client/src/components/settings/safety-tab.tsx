import { useState, useEffect } from 'react'
import { Shield, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useProject } from '@/providers/project-provider'
import { useAuth } from '@/providers/auth-provider'
import { projectsApi } from '@/lib/resources'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export function SafetyTab() {
  const { projectId } = useProject()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const isTechLead = user?.role === 'techlead'

  const { data: project } = useQuery({
    queryKey: queryKeys.projects.detail(projectId),
    queryFn: async () => {
      const { project } = await projectsApi.get(projectId)
      return project
    },
    enabled: !!projectId,
  })

  const [safetyMode, setSafetyMode] = useState<'a' | 'b'>('a')
  const [maxInputTokens, setMaxInputTokens] = useState('')
  const [maxOutputTokens, setMaxOutputTokens] = useState('')
  const [maxToolCalls, setMaxToolCalls] = useState('')

  useEffect(() => {
    if (project) {
      const p = project as unknown as Record<string, unknown>
      setSafetyMode((p.safetyMode as 'a' | 'b') ?? 'a')
      setMaxInputTokens(p.maxSessionInputTokens ? String(p.maxSessionInputTokens) : '')
      setMaxOutputTokens(p.maxSessionOutputTokens ? String(p.maxSessionOutputTokens) : '')
      setMaxToolCalls(p.maxSessionToolCalls ? String(p.maxSessionToolCalls) : '')
    }
  }, [project])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      projectsApi.update(projectId, data as Parameters<typeof projectsApi.update>[1]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) })
      toast.success('Safety settings updated')
    },
    onError: (err) => {
      toast.error(`Failed to save: ${err instanceof Error ? err.message : 'Unknown error'}`)
    },
  })

  const handleSave = () => {
    updateMutation.mutate({
      safety_mode: safetyMode,
      max_session_input_tokens: maxInputTokens ? parseInt(maxInputTokens) : null,
      max_session_output_tokens: maxOutputTokens ? parseInt(maxOutputTokens) : null,
      max_session_tool_calls: maxToolCalls ? parseInt(maxToolCalls) : null,
    })
  }

  if (!isTechLead) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <ShieldAlert className="h-12 w-12 text-ink-disabled mb-3" />
        <p className="text-sm text-ink-muted">TechLead access required</p>
        <p className="text-xs text-ink-disabled mt-1">Only TechLeads can modify safety settings</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl space-y-6 py-4">
      {/* Permission Mode Gating */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-1">Permission Mode Gating</h3>
        <p className="text-xs text-ink-muted mb-3">Controls who can use bypassPermissions mode in agent sessions.</p>
        <div className="flex gap-3">
          {([
            { id: 'a' as const, label: 'Mode A — Open', desc: 'All users can select any permission mode' },
            { id: 'b' as const, label: 'Mode B — Restricted', desc: 'Only TechLeads can use Bypass mode' },
          ]).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSafetyMode(m.id)}
              className={cn(
                'flex-1 rounded-[var(--radius-md)] border p-3 text-left transition-colors cursor-pointer',
                safetyMode === m.id
                  ? 'border-accent bg-accent-subtle'
                  : 'border-edge hover:border-edge-hover',
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4" />
                <span className="text-sm font-medium text-ink">{m.label}</span>
                {safetyMode === m.id && <Badge variant="accent" className="text-[9px]">Active</Badge>}
              </div>
              <p className="text-xs text-ink-muted">{m.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Session Limits */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-1">Session Limits</h3>
        <p className="text-xs text-ink-muted mb-3">Maximum token usage and tool calls per agent session. Leave empty for defaults.</p>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-xs text-ink-secondary w-36">Max Input Tokens</label>
            <Input
              value={maxInputTokens}
              onChange={(e) => setMaxInputTokens(e.target.value)}
              placeholder="500,000 (default)"
              className="h-8 text-xs font-mono max-w-48"
              type="number"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-ink-secondary w-36">Max Output Tokens</label>
            <Input
              value={maxOutputTokens}
              onChange={(e) => setMaxOutputTokens(e.target.value)}
              placeholder="100,000 (default)"
              className="h-8 text-xs font-mono max-w-48"
              type="number"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs text-ink-secondary w-36">Max Tool Calls</label>
            <Input
              value={maxToolCalls}
              onChange={(e) => setMaxToolCalls(e.target.value)}
              placeholder="200 (default)"
              className="h-8 text-xs font-mono max-w-48"
              type="number"
            />
          </div>
        </div>
      </div>

      {/* Command Policy Info */}
      <div>
        <h3 className="text-sm font-semibold text-ink mb-1">Command Policy</h3>
        <p className="text-xs text-ink-muted mb-2">Built-in safety policy for agent tool calls. Custom policies coming soon.</p>
        <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="error" className="text-[9px]">Block</Badge>
            <span className="text-xs text-ink-secondary">rm -rf /, sudo, curl|bash, git push --force main, docker --privileged</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="warning" className="text-[9px]">Ask</Badge>
            <span className="text-xs text-ink-secondary">rm -rf, git push, git reset --hard, writes outside target dir</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default" className="text-[9px]">Deny</Badge>
            <span className="text-xs text-ink-secondary">Read .env, *.pem, *.key, .ssh/, .aws/ (secret files)</span>
          </div>
        </div>
      </div>

      <Button onClick={handleSave} disabled={updateMutation.isPending}>
        {updateMutation.isPending ? 'Saving...' : 'Save Safety Settings'}
      </Button>
    </div>
  )
}
