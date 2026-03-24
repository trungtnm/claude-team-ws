import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { GitBranch, AlertTriangle, CheckCircle2, Clock, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface GraphData {
  nodes: Array<{
    id: string
    title: string
    status: string
    priority: number
    type: string
    labels?: string[]
  }>
  edges: Array<{
    source: string
    target: string
    type: string
  }>
  insights: {
    critical_path: string[]
    bottlenecks: Array<{ id: string; betweenness: number }>
    ready: string[]
  } | null
}

const NODE_WIDTH = 220
const NODE_HEIGHT = 80

function getLayoutedElements(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'LR',
) {
  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 })

  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }
  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target)
  }

  dagre.layout(dagreGraph)

  const layoutedNodes = nodes.map((node) => {
    const n = dagreGraph.node(node.id)
    return {
      ...node,
      position: {
        x: n.x - NODE_WIDTH / 2,
        y: n.y - NODE_HEIGHT / 2,
      },
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
    }
  })

  return { nodes: layoutedNodes, edges }
}

function priorityColor(p: number): string {
  switch (p) {
    case 0: return 'var(--priority-p0)'
    case 1: return 'var(--priority-p1)'
    case 2: return 'var(--priority-p2)'
    default: return 'var(--priority-p3)'
  }
}

function statusIcon(status: string) {
  switch (status) {
    case 'closed': return <CheckCircle2 className="h-3.5 w-3.5 text-success" />
    case 'in_progress': return <Zap className="h-3.5 w-3.5 text-warning" />
    case 'blocked': return <AlertTriangle className="h-3.5 w-3.5 text-error" />
    default: return <Clock className="h-3.5 w-3.5 text-ink-muted" />
  }
}

function BeadNode({ data }: { data: { label: string; status: string; priority: number; isCritical: boolean; isReady: boolean } }) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2 shadow-sm transition-all',
        'bg-surface-raised hover:bg-surface-elevated',
        data.isCritical ? 'border-error/50 shadow-error/10' : 'border-edge',
        data.isReady && 'border-success/50',
      )}
      style={{ width: NODE_WIDTH, minHeight: NODE_HEIGHT }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {statusIcon(data.status)}
        <span className="text-xs font-medium text-ink truncate">{data.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: priorityColor(data.priority) }}
        />
        <span className="text-[10px] text-ink-muted">P{data.priority}</span>
        {data.isCritical && (
          <Badge className="text-[9px] bg-error/15 text-error px-1 py-0">critical</Badge>
        )}
        {data.isReady && (
          <Badge className="text-[9px] bg-success/15 text-success px-1 py-0">ready</Badge>
        )}
      </div>
    </div>
  )
}

const nodeTypes: NodeTypes = {
  bead: BeadNode,
}

export default function GraphPage() {
  const { projectId } = useParams<{ projectId: string }>()

  const { data: graphData, isLoading, error } = useQuery({
    queryKey: ['graph', projectId],
    queryFn: () => api.get<GraphData>(`/projects/${projectId}/graph`),
    enabled: !!projectId,
    staleTime: 60000,
  })

  const { nodes, edges } = useMemo(() => {
    if (!graphData) return { nodes: [], edges: [] }

    const criticalSet = new Set(graphData.insights?.critical_path || [])
    const readySet = new Set(graphData.insights?.ready || [])

    const rawNodes: Node[] = graphData.nodes.map((n) => ({
      id: n.id,
      type: 'bead',
      position: { x: 0, y: 0 },
      data: {
        label: `${n.id}: ${n.title}`,
        status: n.status,
        priority: n.priority,
        isCritical: criticalSet.has(n.id),
        isReady: readySet.has(n.id),
      },
    }))

    const rawEdges: Edge[] = graphData.edges.map((e, i) => ({
      id: `e-${i}`,
      source: e.source,
      target: e.target,
      animated: criticalSet.has(e.source) && criticalSet.has(e.target),
      style: {
        stroke: criticalSet.has(e.source) && criticalSet.has(e.target)
          ? 'var(--priority-p0)'
          : 'var(--border-default)',
      },
    }))

    return getLayoutedElements(rawNodes, rawEdges)
  }, [graphData])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-1 bg-surface-base">
        <p className="text-ink-muted">Loading dependency graph...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center flex-1 bg-surface-base">
        <div className="text-center">
          <GitBranch className="h-12 w-12 text-ink-disabled mx-auto mb-3" />
          <p className="text-ink-muted">Failed to load graph</p>
          <p className="text-ink-disabled text-sm mt-1">{(error as Error).message}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 bg-surface-base">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--surface-base)' }}
      >
        <Background color="var(--border-subtle)" gap={20} />
        <Controls
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
          }}
        />
        <MiniMap
          style={{
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-default)',
            borderRadius: '8px',
          }}
          nodeColor={(n) => {
            if (n.data?.isCritical) return 'var(--priority-p0)'
            if (n.data?.isReady) return 'var(--status-running)'
            return 'var(--border-default)'
          }}
        />
      </ReactFlow>
    </div>
  )
}
