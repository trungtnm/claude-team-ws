import { ScrollArea } from '@/components/ui/scroll-area'
import { StreamEvent } from './stream-event'
import { streamEvents } from '@/data/agent-stream'
import { sessions } from '@/data/sessions'

interface AgentStreamViewProps {
  sessionId: string
}

export function AgentStreamView({ sessionId }: AgentStreamViewProps) {
  const session = sessions.find((s) => s.id === sessionId)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-4">
          {streamEvents.map((event) => (
            <StreamEvent key={event.id} event={event} />
          ))}
          {session?.status === 'running' && (
            <div className="flex items-center gap-1 pl-1 pt-1">
              <span className="h-4 w-1.5 rounded-sm bg-accent animate-cursor" />
              <span className="text-xs text-ink-muted">Agent is thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
