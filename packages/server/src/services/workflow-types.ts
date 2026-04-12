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

/** Parse workflow_nodes JSON from session record */
export function parseWorkflowNodes(json: string | null): WorkflowNode[] | null {
  if (!json) return null
  try {
    const nodes = JSON.parse(json)
    if (!Array.isArray(nodes) || nodes.length === 0) return null
    return nodes as WorkflowNode[]
  } catch {
    return null
  }
}
