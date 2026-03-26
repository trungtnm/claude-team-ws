import type { GraphNodeData } from '@/data/graph-nodes'

interface GraphLegendProps {
  nodes: GraphNodeData[]
}

const roleItems = [
  { label: 'Critical Path', color: 'bg-red-500' },
  { label: 'Bottleneck', color: 'bg-orange-500' },
  { label: 'Ready', color: 'bg-green-500' },
  { label: 'Normal', color: 'bg-gray-400' },
]

export function GraphLegend({ nodes }: GraphLegendProps) {
  const criticalCount = nodes.filter((n) => n.role === 'critical').length
  const readyCount = nodes.filter((n) => n.role === 'ready').length
  const bottleneckCount = nodes.filter((n) => n.role === 'bottleneck').length

  return (
    <div className="flex items-center justify-between border-t border-edge bg-surface-raised px-4 py-3">
      <div className="flex items-center gap-6">
        {roleItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.color}`} />
            <span className="text-xs text-ink-secondary">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-ink-muted">
        Critical Path: {criticalCount} | Ready: {readyCount} | Bottlenecks: {bottleneckCount}
      </div>
    </div>
  )
}
