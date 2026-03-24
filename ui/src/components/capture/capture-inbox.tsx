import { useNavigate } from 'react-router-dom'
import { Inbox, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useCaptureStore } from '@/stores/capture-store'
import { cn } from '@/lib/utils'

export function CaptureInbox() {
  const navigate = useNavigate()
  const captures = useCaptureStore((s) => s.captures)
  const pendingCaptures = captures.filter((c) => c.status === 'pending')
  const pendingCount = pendingCaptures.length
  const previewCaptures = pendingCaptures.slice(0, 3)

  return (
    <div className="flex flex-col border-t border-edge">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <Inbox className="h-3.5 w-3.5 text-ink-secondary" />
        <span className="text-xs font-medium text-ink-secondary">Captures</span>
        {pendingCount > 0 && (
          <Badge variant="accent" className="text-[10px] px-1.5 py-0">
            {pendingCount}
          </Badge>
        )}
      </div>

      {/* Preview list */}
      <div className="flex flex-col gap-0.5 px-3 pb-1" style={{ maxHeight: '150px', overflow: 'hidden' }}>
        {previewCaptures.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-ink-muted">
            No pending captures
          </p>
        ) : (
          previewCaptures.map((capture) => (
            <button
              key={capture.id}
              type="button"
              onClick={() => navigate(`/captures?highlight=${capture.id}`)}
              className={cn(
                'w-full text-left rounded-[var(--radius-sm)] px-2 py-1.5 transition-colors cursor-pointer',
                'hover:bg-surface-elevated',
              )}
            >
              <p className="line-clamp-1 text-[11px] text-ink-secondary">
                {capture.text}
              </p>
            </button>
          ))
        )}
      </div>

      {/* View all link */}
      <button
        type="button"
        onClick={() => navigate('/captures')}
        className={cn(
          'flex items-center justify-center gap-1 px-3 py-2 text-[11px] text-ink-muted',
          'transition-colors hover:text-accent cursor-pointer',
        )}
      >
        View all captures
        <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  )
}
