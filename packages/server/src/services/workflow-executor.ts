import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import type { WorkflowNode, WorkflowStepResult, BashNodeConfig } from './workflow-types.js'

const execFile = promisify(execFileCb)

const BASH_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes per bash command

export interface WorkflowCallbacks {
  /** Called when a step starts */
  onStepStart: (nodeId: string, type: string) => void
  /** Called when a step completes */
  onStepComplete: (result: WorkflowStepResult) => void
  /** Called when a bash step fails — should ask user and return true to continue, false to abort */
  onBashFailure: (nodeId: string, command: string, error: string, exitCode: number) => Promise<boolean>
  /** Called to execute the prompt node — delegates to session runner's runAgent */
  executePrompt: () => Promise<void>
  /** Check if execution should be aborted */
  isAborted: () => boolean
}

/**
 * Execute workflow nodes sequentially.
 * v1: linear chain only — no parallel execution, no conditionals, no variables.
 */
export async function executeWorkflow(
  nodes: WorkflowNode[],
  cwd: string,
  env: Record<string, string | undefined> | undefined,
  callbacks: WorkflowCallbacks,
): Promise<WorkflowStepResult[]> {
  const results: WorkflowStepResult[] = []

  for (const node of nodes) {
    if (callbacks.isAborted()) {
      results.push(makeSkipped(node))
      continue
    }

    callbacks.onStepStart(node.id, node.type)
    const startedAt = Date.now()

    if (node.type === 'bash') {
      const result = await executeBashNode(node, cwd, env, callbacks)
      results.push(result)
      if (result.status === 'failed') {
        // Remaining nodes are skipped
        break
      }
    } else if (node.type === 'prompt') {
      const result = await executePromptNode(node, callbacks)
      results.push(result)
      if (result.status === 'failed') break
    }
  }

  return results
}

async function executeBashNode(
  node: WorkflowNode,
  cwd: string,
  env: Record<string, string | undefined> | undefined,
  callbacks: WorkflowCallbacks,
): Promise<WorkflowStepResult> {
  const config = node.config as BashNodeConfig
  const startedAt = Date.now()
  const outputs: string[] = []

  for (const command of config.commands) {
    if (callbacks.isAborted()) {
      return makeResult(node, startedAt, 'skipped')
    }

    try {
      const { stdout, stderr } = await execFile('bash', ['-c', command], {
        cwd,
        timeout: BASH_TIMEOUT_MS,
        env: env ? { ...process.env, ...env } : undefined,
        maxBuffer: 1024 * 1024, // 1MB
      })
      const output = (stdout + stderr).trim()
      if (output) outputs.push(output)
    } catch (err: unknown) {
      const error = err as { message?: string; code?: number; stdout?: string; stderr?: string }
      const exitCode = error.code ?? 1
      const errorOutput = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').trim()

      // Ask user whether to continue
      const shouldContinue = await callbacks.onBashFailure(
        node.id, command, errorOutput, exitCode,
      )

      if (!shouldContinue) {
        const result = makeResult(node, startedAt, 'failed', exitCode)
        result.output = outputs.join('\n')
        result.error = errorOutput
        callbacks.onStepComplete(result)
        return result
      }
      // User chose to continue despite failure
      outputs.push(`[WARN] Command failed (exit ${exitCode}), continuing: ${errorOutput}`)
    }
  }

  const result = makeResult(node, startedAt, 'success', 0)
  result.output = outputs.join('\n').slice(0, 10000) // Cap output at 10KB
  callbacks.onStepComplete(result)
  return result
}

async function executePromptNode(
  node: WorkflowNode,
  callbacks: WorkflowCallbacks,
): Promise<WorkflowStepResult> {
  const startedAt = Date.now()

  try {
    await callbacks.executePrompt()
    const result = makeResult(node, startedAt, 'success')
    callbacks.onStepComplete(result)
    return result
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    const result = makeResult(node, startedAt, 'failed')
    result.error = message
    callbacks.onStepComplete(result)
    return result
  }
}

function makeResult(
  node: WorkflowNode,
  startedAt: number,
  status: WorkflowStepResult['status'],
  exitCode?: number,
): WorkflowStepResult {
  const finishedAt = Date.now()
  return {
    nodeId: node.id,
    type: node.type,
    status,
    startedAt: Math.floor(startedAt / 1000),
    finishedAt: Math.floor(finishedAt / 1000),
    durationMs: finishedAt - startedAt,
    exitCode,
  }
}

function makeSkipped(node: WorkflowNode): WorkflowStepResult {
  const now = Date.now()
  return {
    nodeId: node.id,
    type: node.type,
    status: 'skipped',
    startedAt: Math.floor(now / 1000),
    finishedAt: Math.floor(now / 1000),
    durationMs: 0,
  }
}
