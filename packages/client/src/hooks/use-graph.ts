import { useQuery } from '@tanstack/react-query'
import { graphApi } from '@/lib/resources'
import { queryKeys } from '@/lib/query-keys'
import { useProject } from '@/providers/project-provider'
import type { GraphNodeData } from '@/types'

export interface GraphEdgeUI {
  source: string
  target: string
}

// ─── bv --robot-graph JSON shape ────────────────────────────────────────────────

interface BvGraphNode {
  id: string
  title: string
  status: string
  priority: number
  labels?: string[]
  pagerank?: number
}

interface BvGraphEdge {
  from: string
  to: string
  type: string
}

interface BvGraphResponse {
  adjacency: {
    nodes: BvGraphNode[]
    edges: BvGraphEdge[]
  }
}

// ─── Transform bv output → UI shape ─────────────────────────────────────────────

function mapStatus(bvStatus: string): GraphNodeData['status'] {
  switch (bvStatus) {
    case 'closed':
    case 'done':
      return 'done'
    case 'in_progress':
      return 'in_progress'
    case 'ready':
      return 'ready'
    default:
      return 'open'
  }
}

function computeRoles(
  nodes: BvGraphNode[],
  edges: BvGraphEdge[],
): Map<string, GraphNodeData['role']> {
  const roles = new Map<string, GraphNodeData['role']>()

  // Count in-degree (how many nodes depend on this one)
  const inDegree = new Map<string, number>()
  for (const edge of edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) ?? 0) + 1)
  }

  // Sort by pagerank descending to find critical/bottleneck thresholds
  const pagerankValues = nodes
    .map((n) => n.pagerank ?? 0)
    .filter((v) => v > 0)
    .sort((a, b) => b - a)

  const criticalThreshold = pagerankValues[Math.floor(pagerankValues.length * 0.08)] ?? Infinity
  const bottleneckThreshold = pagerankValues[Math.floor(pagerankValues.length * 0.20)] ?? Infinity

  for (const node of nodes) {
    const pr = node.pagerank ?? 0
    const status = mapStatus(node.status)

    if (pr >= criticalThreshold && pr > 0.02) {
      roles.set(node.id, 'critical')
    } else if ((pr >= bottleneckThreshold && pr > 0.012) || (inDegree.get(node.id) ?? 0) >= 4) {
      roles.set(node.id, 'bottleneck')
    } else if (status === 'ready' || status === 'open') {
      // Open nodes with no blockers are "ready"
      const hasBlockers = edges.some((e) => e.from === node.id)
      if (!hasBlockers && status === 'open') {
        roles.set(node.id, 'ready')
      } else if (status === 'ready') {
        roles.set(node.id, 'ready')
      } else {
        roles.set(node.id, 'normal')
      }
    } else {
      roles.set(node.id, 'normal')
    }
  }

  return roles
}

function transformGraph(bvData: BvGraphResponse): {
  nodes: GraphNodeData[]
  edges: GraphEdgeUI[]
} {
  const { nodes: bvNodes, edges: bvEdges } = bvData.adjacency
  const roles = computeRoles(bvNodes, bvEdges)

  const nodes: GraphNodeData[] = bvNodes.map((n) => ({
    id: n.id,
    title: n.title,
    status: mapStatus(n.status),
    role: roles.get(n.id) ?? 'normal',
    priority: n.priority,
    type: n.labels?.[0] ?? 'task',
  }))

  const edges: GraphEdgeUI[] = bvEdges.map((e) => ({
    source: e.from,
    target: e.to,
  }))

  return { nodes, edges }
}

// ─── Query hook ─────────────────────────────────────────────────────────────────

export function useGraphData() {
  const { projectId } = useProject()

  return useQuery({
    queryKey: queryKeys.graph.data(projectId),
    queryFn: async () => {
      const data = await graphApi.get(projectId)
      // graphApi.get returns { graph: BvGraphResponse } after camelCase conversion
      const graphData = (data as unknown as { graph: BvGraphResponse }).graph
      return transformGraph(graphData)
    },
    enabled: !!projectId,
    staleTime: 30_000, // Graph data changes infrequently
  })
}
