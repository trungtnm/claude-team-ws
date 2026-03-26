import { Loader2 } from 'lucide-react'
import { DependencyGraph } from '@/components/graph/dependency-graph'
import { GraphLegend } from '@/components/graph/graph-legend'
import { useGraphData } from '@/hooks/use-graph'

export default function GraphPage() {
  const { data, isLoading, error } = useGraphData()

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-ink-muted" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-ink-muted">
          {error ? `Failed to load graph: ${error.message}` : 'No graph data available'}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-6 py-4">
        <h1 className="text-xl font-semibold text-ink">Dependency Graph</h1>
        <p className="text-sm text-ink-muted">
          {data.nodes.length} nodes &middot; {data.edges.length} edges
        </p>
      </div>

      <DependencyGraph graphNodes={data.nodes} graphEdges={data.edges} />

      <GraphLegend nodes={data.nodes} />
    </div>
  )
}
