import { useMemo, useCallback } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
} from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import Dagre from '@dagrejs/dagre'
import '@xyflow/react/dist/style.css'

import { GraphNode } from '@/components/graph/graph-node'
import { GraphControls } from '@/components/graph/graph-controls'
import type { GraphNodeData, GraphEdge as GraphEdgeData } from '@/data/graph-nodes'

const NODE_WIDTH = 180
const NODE_HEIGHT = 90

const nodeTypes = { custom: GraphNode }

function buildLayoutedElements(
  graphNodes: GraphNodeData[],
  graphEdges: GraphEdgeData[],
): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 80, ranksep: 100 })

  for (const node of graphNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT })
  }

  for (const edge of graphEdges) {
    g.setEdge(edge.source, edge.target)
  }

  Dagre.layout(g)

  const criticalNodeIds = new Set(
    graphNodes.filter((n) => n.role === 'critical').map((n) => n.id),
  )

  const nodes: Node[] = graphNodes.map((node) => {
    const pos = g.node(node.id)
    return {
      id: node.id,
      type: 'custom' as const,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - NODE_HEIGHT / 2,
      },
      data: { ...node } as Record<string, unknown>,
    }
  })

  const edges: Edge[] = graphEdges.map((edge, i) => {
    const isCriticalEdge = criticalNodeIds.has(edge.source) && criticalNodeIds.has(edge.target)
    return {
      id: `e-${i}`,
      source: edge.source,
      target: edge.target,
      animated: isCriticalEdge,
      style: {
        stroke: isCriticalEdge ? '#ef4444' : '#78716c',
        strokeWidth: isCriticalEdge ? 2 : 1.5,
      },
    }
  })

  return { nodes, edges }
}

interface DependencyGraphInnerProps {
  graphNodes: GraphNodeData[]
  graphEdges: GraphEdgeData[]
}

function DependencyGraphInner({ graphNodes, graphEdges }: DependencyGraphInnerProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => buildLayoutedElements(graphNodes, graphEdges),
    [graphNodes, graphEdges],
  )

  const [nodes, , onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges)

  const criticalNodeIds = useMemo(
    () => new Set(graphNodes.filter((n) => n.role === 'critical').map((n) => n.id)),
    [graphNodes],
  )

  const handleToggleCriticalPath = useCallback(
    (enabled: boolean) => {
      setEdges((currentEdges) =>
        currentEdges.map((edge) => {
          const isCriticalEdge =
            criticalNodeIds.has(edge.source) && criticalNodeIds.has(edge.target)
          if (!isCriticalEdge) return edge
          return {
            ...edge,
            animated: enabled,
            style: {
              stroke: enabled ? '#ef4444' : '#78716c',
              strokeWidth: enabled ? 2 : 1.5,
            },
          }
        }),
      )
    },
    [criticalNodeIds, setEdges],
  )

  return (
    <div className="relative flex-1 dependency-graph">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!bg-surface-base"
          color="#57534e"
        />
        <GraphControls onToggleCriticalPath={handleToggleCriticalPath} />
      </ReactFlow>
    </div>
  )
}

interface DependencyGraphProps {
  graphNodes: GraphNodeData[]
  graphEdges: GraphEdgeData[]
}

export function DependencyGraph({ graphNodes, graphEdges }: DependencyGraphProps) {
  return (
    <ReactFlowProvider>
      <DependencyGraphInner graphNodes={graphNodes} graphEdges={graphEdges} />
    </ReactFlowProvider>
  )
}
