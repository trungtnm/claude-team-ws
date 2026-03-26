import { useQuery } from '@tanstack/react-query'
import { sessionsApi } from '@/lib/resources'

/**
 * Fetch the latest question text for a session that's waiting for input.
 * Returns the question text if found, null otherwise.
 */
export function useLatestQuestion(sessionId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['session-question', sessionId],
    queryFn: async () => {
      if (!sessionId) return null
      const { events } = await sessionsApi.events(sessionId, { limit: 10 })

      // Walk events in reverse to find the latest question
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i]
        let data: Record<string, unknown>
        try {
          data = typeof event.data === 'string'
            ? JSON.parse(event.data)
            : (event.data as Record<string, unknown>)
        } catch {
          continue
        }

        // Check for question data in various event shapes
        if (data?.questionData && (data.questionData as Record<string, unknown>)?.text) {
          return (data.questionData as Record<string, unknown>).text as string
        }
        if (data?.question && (data.question as Record<string, unknown>)?.text) {
          return (data.question as Record<string, unknown>).text as string
        }
        if (data?.type === 'question' && data?.text) return data.text as string

        // AskUserQuestion events from Claude Agent SDK
        if (event.eventType === 'tool_use' && data?.toolName === 'AskUserQuestion') {
          let input: Record<string, unknown>
          try {
            input = typeof data.toolInput === 'string'
              ? JSON.parse(data.toolInput)
              : (data.toolInput as Record<string, unknown>)
          } catch {
            continue
          }
          if (input?.question) return input.question as string
        }
      }

      return null
    },
    enabled: !!sessionId && enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  })
}
