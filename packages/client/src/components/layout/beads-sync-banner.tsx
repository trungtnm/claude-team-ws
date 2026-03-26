import { useState } from 'react'
import { AlertTriangle, X, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useSocketEvent } from '@/hooks/use-socket-event'
import type { BeadsSyncConflictEvent, BeadsSyncResolvedEvent } from '@/types/socket-events'

interface ConflictState {
  error: string
  details: string
  actionRequired: string
  hostCommand: string
}

export function BeadsSyncBanner() {
  const [conflict, setConflict] = useState<ConflictState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useSocketEvent<BeadsSyncConflictEvent>('beads:sync_conflict', (data) => {
    setConflict({
      error: data.error,
      details: data.details,
      actionRequired: data.actionRequired,
      hostCommand: data.hostCommand,
    })
    setDismissed(false)
  })

  useSocketEvent<BeadsSyncResolvedEvent>('beads:sync_resolved', () => {
    setConflict(null)
    setDismissed(false)
  })

  if (!conflict || dismissed) return null

  return (
    <div className="border-b px-4 py-2 flex items-center gap-3" style={{
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      borderColor: 'rgba(239, 68, 68, 0.2)',
    }}>
      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--error)' }} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium" style={{ color: 'var(--error)' }}>
          Beads sync conflict
        </span>
        <span className="text-sm ml-2" style={{ color: 'var(--text-secondary)' }}>
          {conflict.actionRequired}
        </span>
      </div>
      {conflict.hostCommand && (
        <code className="text-xs px-2 py-1 rounded flex items-center gap-1.5 shrink-0" style={{
          backgroundColor: 'var(--surface-elevated)',
          color: 'var(--text-secondary)',
        }}>
          <Terminal className="h-3 w-3" />
          {conflict.hostCommand}
        </code>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        onClick={() => setDismissed(true)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
