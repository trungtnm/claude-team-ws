import { useMemo } from 'react'
import { useSessionEventsQuery } from './use-sessions'

export interface SessionStats {
  turns: number
  filesModified: number
  tokensUsed: number
  costUsd: number
  contextPercentage: number
  /** Latest input tokens for context detail display */
  inputTokens: number
  /** Latest cache read tokens for context detail display */
  cacheReadTokens: number
}

const MODEL_CONTEXT_WINDOW: Record<string, number> = {
  sonnet: 200_000,
  opus: 200_000,
  haiku: 200_000,
}

/**
 * Compute session stats by aggregating session events.
 * - Turns: count of 'assistant' events
 * - Files: unique file paths from tool_use (Write, Edit) events
 * - Tokens: cumulative from result events or assistant usage
 * - Cost: extracted from result events
 * - Context: latest context window percentage from system events
 */
export function useSessionStats(sessionId: string | undefined, model = 'sonnet'): SessionStats {
  const { data } = useSessionEventsQuery(sessionId)
  const events = data?.events ?? []

  return useMemo(() => {
    let turns = 0
    let tokensUsed = 0
    let contextPercentage = 0
    let costUsd = 0
    let inputTokens = 0
    let cacheReadTokens = 0
    const files = new Set<string>()

    for (const event of events) {
      let parsed: Record<string, unknown>
      try {
        parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
      } catch {
        continue
      }

      if (event.eventType === 'assistant') {
        turns++
      }

      // Extract context window from system events (emitted by session runner)
      if (event.eventType === 'system') {
        const cw = parsed.contextWindow as Record<string, unknown> | undefined
        if (cw) {
          contextPercentage = (cw.usedPercentage as number) ?? contextPercentage
          const usage = cw.currentUsage as Record<string, number> | undefined
          if (usage) {
            inputTokens = usage.inputTokens ?? inputTokens
            cacheReadTokens = usage.cacheReadInputTokens ?? cacheReadTokens
          }
        }
      }

      // Extract cost and token totals from result events
      if (event.eventType === 'result') {
        const content = parsed.content as string | undefined
        if (content) {
          try {
            const resultData = JSON.parse(content)
            if (resultData.costUsd) costUsd += resultData.costUsd
            if (resultData.tokensUsed) tokensUsed += resultData.tokensUsed
            if (resultData.totalTurns) turns = Math.max(turns, resultData.totalTurns)
          } catch {
            // Not JSON — ignore
          }
        }
      }

      if (event.eventType === 'tool_use') {
        // Extract file path from tool inputs
        const toolName = (parsed.toolName ?? parsed.name) as string | undefined
        const toolInput = parsed.toolInput as string | undefined
        if (toolName && ['Write', 'Edit', 'write', 'edit', 'NotebookEdit'].includes(toolName)) {
          // toolInput is a formatted string, try to extract file path
          if (toolInput) files.add(toolInput)
        }
      }
    }

    // Fallback context percentage from input tokens if no system event had it
    if (contextPercentage === 0 && inputTokens > 0) {
      const maxTokens = MODEL_CONTEXT_WINDOW[model] ?? 200_000
      contextPercentage = Math.round((inputTokens / maxTokens) * 100)
    }

    return {
      turns,
      filesModified: files.size,
      tokensUsed,
      costUsd,
      contextPercentage,
      inputTokens,
      cacheReadTokens,
    }
  }, [events, model])
}
