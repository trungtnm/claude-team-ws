import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Priority } from '@/data/epics'

const priorityConfig: Record<Priority, { className: string; label: string }> = {
  0: { className: 'bg-red-500/15 text-red-400', label: 'P0' },
  1: { className: 'bg-blue-500/15 text-blue-400', label: 'P1' },
  2: { className: 'bg-yellow-500/15 text-yellow-400', label: 'P2' },
  3: { className: 'bg-gray-500/15 text-gray-400', label: 'P3' },
}

interface PriorityBadgeProps {
  priority: Priority
  className?: string
}

export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority]

  return (
    <Badge className={cn(config.className, className)}>
      {config.label}
    </Badge>
  )
}
