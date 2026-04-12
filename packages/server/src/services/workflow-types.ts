import { z } from 'zod'

// ─── Workflow Node Types ─────────────────────────────────────────────────────
// v1: Strictly sequential execution. No parallel nodes, no conditionals,
// no variable interpolation. Designed to evolve into a full DAG engine.

export type WorkflowNodeType = 'bash' | 'prompt'

export interface BashNodeConfig {
  commands: string[]
}

export interface PromptNodeConfig {
  // v1: empty — uses session prompt. Future: custom prompt override.
}

export interface WorkflowNode {
  id: string
  type: WorkflowNodeType
  config: BashNodeConfig | PromptNodeConfig
}

export interface WorkflowStepResult {
  nodeId: string
  type: WorkflowNodeType
  status: 'success' | 'failed' | 'skipped'
  startedAt: number
  finishedAt: number
  durationMs: number
  exitCode?: number
  output?: string
  error?: string
}

// ─── Validation ─────────────────────────────────────────────────────────────

const bashConfigSchema = z.object({
  commands: z.array(z.string().max(2000)).min(1).max(10),
})

const promptConfigSchema = z.object({})

const workflowNodeSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(['bash', 'prompt']),
  config: z.union([bashConfigSchema, promptConfigSchema]),
})

const workflowNodesSchema = z.array(workflowNodeSchema).min(1).max(20)

/** Parse and validate workflow_nodes JSON from session record */
export function parseWorkflowNodes(json: string | null): WorkflowNode[] | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json)
    const parsed = workflowNodesSchema.safeParse(raw)
    if (!parsed.success) return null
    return parsed.data as WorkflowNode[]
  } catch {
    return null
  }
}
