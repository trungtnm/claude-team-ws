import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { GraphNodeData } from '@/data/graph-nodes'

const roleBorderColors: Record<GraphNodeData['role'], string> = {
  critical: 'border-red-500',
  bottleneck: 'border-orange-500',
  ready: 'border-green-500',
  normal: 'border-edge',
}

const statusDotColors: Record<GraphNodeData['status'], string> = {
  done: 'bg-green-400',
  in_progress: 'bg-blue-400',
  ready: 'bg-green-400',
  open: 'bg-gray-400',
}

const statusLabels: Record<GraphNodeData['status'], string> = {
  done: 'Done',
  in_progress: 'In Progress',
  ready: 'Ready',
  open: 'Open',
}

interface GraphNodeProps {
  data: GraphNodeData
}

function GraphNodeComponent({ data }: GraphNodeProps) {
  return (
    <div
      className={`w-[180px] rounded-[var(--radius-lg)] border-2 bg-surface-raised p-3 ${roleBorderColors[data.role]}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-ink-muted" />

      <p className="font-mono text-xs text-ink-muted">{data.id}</p>

      <p className="mt-1 text-sm font-medium text-ink leading-tight">
        {data.title}
      </p>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 rounded-full ${statusDotColors[data.status]}`} />
          <span className="text-[11px] text-ink-secondary">
            {statusLabels[data.status]}
          </span>
        </div>
        {data.assignee && (
          <span className="text-[11px] text-ink-muted truncate max-w-[60px]">
            {data.assignee}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-ink-muted" />
    </div>
  )
}

export const GraphNode = memo(GraphNodeComponent)
