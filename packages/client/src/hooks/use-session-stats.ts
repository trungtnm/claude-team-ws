import { useMemo } from 'react'
import { useSessionEventsQuery } from './use-sessions'

export interface SessionStats {
  turns: number
  filesModified: number
  tokensUsed: number
  costUsd: number
  contextPercentage: number
}

const MODEL_PRICING_PER_MTOK: Record<string, number> = {
  sonnet: 3,
  opus: 15,
  haiku: 0.25,
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
 * - Tokens: cumulative usage.input_tokens from assistant events
 * - Cost: estimated from token counts using model-specific pricing
 * - Context: latest usage percentage (input_tokens / max_tokens)
 */
export function useSessionStats(sessionId: string | undefined, model = 'sonnet'): SessionStats {
  const { data } = useSessionEventsQuery(sessionId)
  const events = data?.events ?? []

  return useMemo(() => {
    let turns = 0
    let tokensUsed = 0
    let contextPercentage = 0
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

        // Extract token usage from assistant.message.usage
        const message = parsed.message as Record<string, unknown> | undefined
        const usage = message?.usage as Record<string, number> | undefined
        if (usage) {
          const input = usage.input_tokens ?? 0
          const cacheCreation = usage.cache_creation_input_tokens ?? 0
          const cacheRead = usage.cache_read_input_tokens ?? 0
          tokensUsed += input + cacheCreation + cacheRead

          // Context percentage: latest snapshot against model's context window
          const latestContext = input + cacheCreation + cacheRead
          const maxTokens = MODEL_CONTEXT_WINDOW[model] ?? 200_000
          contextPercentage = Math.round((latestContext / maxTokens) * 100)
        }
      }

      if (event.eventType === 'tool_use') {
        // Extract file path from tool inputs
        const toolName = parsed.name as string | undefined
        const input = parsed.input as Record<string, unknown> | undefined
        if (input && (toolName === 'Write' || toolName === 'Edit' || toolName === 'write' || toolName === 'edit')) {
          const filePath = (input.file_path ?? input.filePath) as string | undefined
          if (filePath) files.add(filePath)
        }
      }
    }

    const costUsd = (tokensUsed / 1_000_000) * (MODEL_PRICING_PER_MTOK[model] ?? 3)

    return {
      turns,
      filesModified: files.size,
      tokensUsed,
      costUsd,
      contextPercentage,
    }
  }, [events])
}
