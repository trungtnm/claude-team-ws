import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { claudeConfigApi } from '@/lib/resources'
import { useProject } from '@/providers/project-provider'
import { toast } from 'sonner'

export function useClaudeMdQuery(repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.claudeMd(projectId, repoId),
    queryFn: () => claudeConfigApi.getClaudeMd(projectId, repoId),
    enabled: !!projectId,
  })
}

export function useClaudeMdMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { content: string; expectedMtime?: number }) =>
      claudeConfigApi.putClaudeMd(projectId, data, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.claudeMd(projectId, repoId) })
      toast.success('CLAUDE.md saved')
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number; body?: { error: string; current_content?: string; current_mtime?: number } }
      if (apiErr.status === 409) {
        toast.error('Conflict: file was modified externally')
      } else {
        toast.error('Failed to save CLAUDE.md')
      }
    },
  })
}

export function useSkillsQuery(repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.skills(projectId, repoId),
    queryFn: async () => {
      const { skills } = await claudeConfigApi.listSkills(projectId, repoId)
      return skills
    },
    enabled: !!projectId,
  })
}

export function useSkillQuery(name: string, repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.skill(projectId, name, repoId),
    queryFn: () => claudeConfigApi.getSkill(projectId, name, repoId),
    enabled: !!projectId && !!name,
  })
}

export function useSkillMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content, expectedMtime }: { name: string; content: string; expectedMtime?: number }) =>
      claudeConfigApi.putSkill(projectId, name, { content, expectedMtime }, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.skills(projectId, repoId) })
      toast.success('Skill saved')
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number }
      if (apiErr.status === 409) {
        toast.error('Conflict: file was modified externally')
      } else {
        toast.error('Failed to save skill')
      }
    },
  })
}

export function useDeleteSkillMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => claudeConfigApi.deleteSkill(projectId, name, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.skills(projectId, repoId) })
      toast.success('Skill deleted')
    },
    onError: () => toast.error('Failed to delete skill'),
  })
}

export function useAgentsQuery(repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.agents(projectId, repoId),
    queryFn: async () => {
      const { agents } = await claudeConfigApi.listAgents(projectId, repoId)
      return agents
    },
    enabled: !!projectId,
  })
}

export function useCommandsQuery(repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.commands(projectId, repoId),
    queryFn: async () => {
      const { commands } = await claudeConfigApi.listCommands(projectId, repoId)
      return commands
    },
    enabled: !!projectId,
  })
}

export function useRulesConfigQuery(repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.rules(projectId, repoId),
    queryFn: async () => {
      const { rules } = await claudeConfigApi.listRules(projectId, repoId)
      return rules
    },
    enabled: !!projectId,
  })
}

// ── Agent mutations ──────────────────────────────────────────────────────

export function useAgentQuery(name: string, repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.agent(projectId, name, repoId),
    queryFn: () => claudeConfigApi.getAgent(projectId, name, repoId),
    enabled: !!projectId && !!name,
  })
}

export function useAgentMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content, expectedMtime }: { name: string; content: string; expectedMtime?: number }) =>
      claudeConfigApi.putAgent(projectId, name, { content, expectedMtime }, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.agents(projectId, repoId) })
      toast.success('Agent saved')
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number }
      toast.error(apiErr.status === 409 ? 'Conflict: file was modified externally' : 'Failed to save agent')
    },
  })
}

export function useDeleteAgentMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => claudeConfigApi.deleteAgent(projectId, name, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.agents(projectId, repoId) })
      toast.success('Agent deleted')
    },
    onError: () => toast.error('Failed to delete agent'),
  })
}

// ── Command mutations ────────────────────────────────────────────────────

export function useCommandQuery(name: string, repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.command(projectId, name, repoId),
    queryFn: () => claudeConfigApi.getCommand(projectId, name, repoId),
    enabled: !!projectId && !!name,
  })
}

export function useCommandMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content, expectedMtime }: { name: string; content: string; expectedMtime?: number }) =>
      claudeConfigApi.putCommand(projectId, name, { content, expectedMtime }, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.commands(projectId, repoId) })
      toast.success('Command saved')
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number }
      toast.error(apiErr.status === 409 ? 'Conflict: file was modified externally' : 'Failed to save command')
    },
  })
}

export function useDeleteCommandMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => claudeConfigApi.deleteCommand(projectId, name, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.commands(projectId, repoId) })
      toast.success('Command deleted')
    },
    onError: () => toast.error('Failed to delete command'),
  })
}

// ── Rule config mutations ────────────────────────────────────────────────

export function useRuleConfigQuery(name: string, repoId?: string) {
  const { projectId } = useProject()
  return useQuery({
    queryKey: queryKeys.claudeConfig.rule(projectId, name, repoId),
    queryFn: () => claudeConfigApi.getRule(projectId, name, repoId),
    enabled: !!projectId && !!name,
  })
}

export function useRuleConfigMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ name, content, expectedMtime }: { name: string; content: string; expectedMtime?: number }) =>
      claudeConfigApi.putRule(projectId, name, { content, expectedMtime }, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.rules(projectId, repoId) })
      toast.success('Rule saved')
    },
    onError: (err: unknown) => {
      const apiErr = err as { status?: number }
      toast.error(apiErr.status === 409 ? 'Conflict: file was modified externally' : 'Failed to save rule')
    },
  })
}

export function useDeleteRuleConfigMutation(repoId?: string) {
  const { projectId } = useProject()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => claudeConfigApi.deleteRule(projectId, name, repoId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.claudeConfig.rules(projectId, repoId) })
      toast.success('Rule deleted')
    },
    onError: () => toast.error('Failed to delete rule'),
  })
}
