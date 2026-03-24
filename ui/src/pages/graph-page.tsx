import { DependencyGraph } from '@/components/graph/dependency-graph'
import { GraphLegend } from '@/components/graph/graph-legend'
import { graphNodes, graphEdges } from '@/data/graph-nodes'

export default function GraphPage() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-edge px-6 py-4">
        <h1 className="text-xl font-semibold text-ink">Dependency Graph</h1>
        <p className="text-sm text-ink-muted">
          {graphNodes.length} nodes &middot; {graphEdges.length} edges
        </p>
      </div>

      <DependencyGraph graphNodes={graphNodes} graphEdges={graphEdges} />

      <GraphLegend nodes={graphNodes} />
    </div>
  )
}
