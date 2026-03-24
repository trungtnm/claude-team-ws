/**
 * HTTP client for CM (CASS Memory) server (Docker container on port 9900).
 * Provides team procedural memory — rules, anti-patterns, confidence decay.
 */

const CM_URL = process.env.CM_URL || 'http://127.0.0.1:9900'

export const cmClient = {
  /** Check if CM server is reachable */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${CM_URL}/health`, { signal: AbortSignal.timeout(3000) })
      return response.ok
    } catch {
      return false
    }
  },

  /**
   * Get relevant context (rules + anti-patterns) for a task description.
   * Returns high-confidence rules the agent should follow.
   */
  async getContext(taskDescription: string, limit = 10): Promise<{
    relevantBullets: Array<{ id: string; content: string; category: string; confidence: number }>
    antiPatterns: Array<{ id: string; content: string; reason: string }>
  }> {
    try {
      const response = await fetch(`${CM_URL}/api/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: taskDescription, limit }),
        signal: AbortSignal.timeout(5000),
      })

      if (!response.ok) {
        console.warn(`CmClient.getContext failed: HTTP ${response.status}`)
        return { relevantBullets: [], antiPatterns: [] }
      }

      const data = await response.json() as {
        data?: {
          relevantBullets?: Array<{ id: string; content: string; category: string; confidence: number }>
          antiPatterns?: Array<{ id: string; content: string; reason: string }>
        }
      }

      return {
        relevantBullets: data.data?.relevantBullets ?? [],
        antiPatterns: data.data?.antiPatterns ?? [],
      }
    } catch (err) {
      console.warn(`CmClient.getContext failed: ${(err as Error).message}`)
      return { relevantBullets: [], antiPatterns: [] }
    }
  },

  /**
   * Record the outcome of a session for confidence updates.
   * Positive outcomes increase confidence of helpful rules.
   */
  async recordOutcome(
    sessionId: string,
    result: 'success' | 'failure',
    ruleIds: string[] = [],
  ): Promise<void> {
    try {
      await fetch(`${CM_URL}/api/outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, result, rule_ids: ruleIds }),
        signal: AbortSignal.timeout(5000),
      })
    } catch (err) {
      console.warn(`CmClient.recordOutcome failed: ${(err as Error).message}`)
    }
  },
}
