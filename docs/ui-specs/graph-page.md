# Graph Page — Dependency Graph (`/graph`)

## Overview

| Attribute | Value |
|-----------|-------|
| Route | `/graph` |
| Page file | `ui/src/pages/graph-page.tsx` |
| Purpose | Interactive dependency graph showing bead relationships, critical path, and bottlenecks |
| Key libraries | `@xyflow/react` (React Flow v12), `@dagrejs/dagre` (auto-layout) |
| Data source (demo) | Static import from `ui/src/data/graph-nodes.ts` |
| Data source (prod) | `GET /api/projects/:projectId/graph` + `GET /api/projects/:projectId/graph/plan` |

---

## Component Tree

```
GraphPage
├── Header bar (title + node/edge count)
├── DependencyGraph
│   └── ReactFlowProvider
│       └── DependencyGraphInner
│           ├── ReactFlow canvas
│           │   ├── Background (dots)
│           │   └── GraphControls (absolute-positioned)
│           └── Custom node: GraphNode (memo'd)
└── GraphLegend
```

---

## Components

### GraphPage (`pages/graph-page.tsx`)

Top-level page wrapper. Purely presentational -- imports static data, renders header + graph + legend.

| Element | Details |
|---------|---------|
| Header left | `<h1>` "Dependency Graph" |
| Header right | Node count + edge count from data arrays (`{graphNodes.length} nodes . {graphEdges.length} edges`) |
| Body | `<DependencyGraph>` fills flex-1 |
| Footer | `<GraphLegend>` pinned to bottom |

**Props passed down:**
- `graphNodes: GraphNodeData[]` and `graphEdges: GraphEdge[]` to `DependencyGraph`
- `nodes: GraphNodeData[]` to `GraphLegend`

---

### DependencyGraph (`components/graph/dependency-graph.tsx`)

Wraps React Flow in a `ReactFlowProvider` and delegates to `DependencyGraphInner`.

#### Layout Engine: Dagre

The `buildLayoutedElements()` function converts raw data into positioned React Flow nodes + styled edges:

| Setting | Value |
|---------|-------|
| Layout direction | `rankdir: 'TB'` (top-to-bottom) |
| Node separation | `nodesep: 80` |
| Rank separation | `ranksep: 100` |
| Node dimensions | `180 x 90` px (constants `NODE_WIDTH`, `NODE_HEIGHT`) |

**Algorithm:**
1. Create a dagre graph, add all nodes and edges
2. Run `Dagre.layout(g)` to compute positions
3. Center each node by offsetting `x - NODE_WIDTH/2`, `y - NODE_HEIGHT/2`
4. Determine critical edges: an edge is "critical" if **both** source and target have `role === 'critical'`
5. Critical edges get `animated: true`, red stroke (`#ef4444`), stroke width 2
6. Normal edges get gray stroke (`#78716c`), stroke width 1.5

#### React Flow Configuration

| Prop | Value |
|------|-------|
| `nodeTypes` | `{ custom: GraphNode }` |
| `fitView` | `true` |
| `fitViewOptions` | `{ padding: 0.2 }` |
| `minZoom` | `0.3` |
| `maxZoom` | `2` |
| `proOptions` | `{ hideAttribution: true }` |
| Background variant | `BackgroundVariant.Dots` |
| Background gap | `20` |
| Background dot size | `1` |
| Background color | `#57534e` on `!bg-surface-base` |

#### Critical Path Toggle

`handleToggleCriticalPath(enabled: boolean)`:
- When toggled OFF: critical edges revert to normal gray styling, animation stops
- When toggled ON: critical edges get red stroke + animation restored
- Uses `setEdges()` updater to map over all edges and conditionally restyle

**State hooks:**
- `useNodesState(layoutedNodes)` -- nodes with drag support
- `useEdgesState(layoutedEdges)` -- edges with toggle support
- `useMemo` for layout computation (re-runs when `graphNodes` or `graphEdges` change)
- `useMemo` for `criticalNodeIds` set

---

### GraphNode (`components/graph/graph-node.tsx`)

Custom React Flow node component, wrapped in `memo()` for performance.

**Props:** `{ data: GraphNodeData }`

#### Visual Structure

```
┌─────────────────────────┐  <- 180px wide, role-based border color
│  bd-42                  │  <- mono font, muted ID
│  Rate Limiting          │  <- semi-bold title, tight leading
│                         │
│  ● Ready      BlueLake  │  <- status dot + label + optional assignee
└─────────────────────────┘
```

#### Role-Based Border Colors

| Role | CSS Class | Color |
|------|-----------|-------|
| `critical` | `border-red-500` | Red |
| `bottleneck` | `border-orange-500` | Orange |
| `ready` | `border-green-500` | Green |
| `normal` | `border-edge` | Theme edge color |

#### Status Dot Colors

| Status | CSS Class | Color |
|--------|-----------|-------|
| `done` | `bg-green-400` | Green |
| `in_progress` | `bg-blue-400` | Blue |
| `ready` | `bg-green-400` | Green |
| `open` | `bg-gray-400` | Gray |

#### Status Labels

| Status | Display Label |
|--------|---------------|
| `done` | "Done" |
| `in_progress` | "In Progress" |
| `ready` | "Ready" |
| `open` | "Open" |

#### Handles

- **Target handle:** `Position.Top` with `!bg-ink-muted`
- **Source handle:** `Position.Bottom` with `!bg-ink-muted`

#### Conditional Rendering

- Assignee is only shown if `data.assignee` is truthy
- Assignee text is truncated at `max-w-[60px]`

---

### GraphControls (`components/graph/graph-controls.tsx`)

Floating button group, absolutely positioned top-right (`top-3 right-3 z-10`).

| Button | Icon | Action | Details |
|--------|------|--------|---------|
| Fit View | `Maximize2` | `fitView({ padding: 0.2, duration: 300 })` | Centers and fits all nodes |
| Zoom In | `ZoomIn` | `zoomIn({ duration: 200 })` | Smooth zoom in |
| Zoom Out | `ZoomOut` | `zoomOut({ duration: 200 })` | Smooth zoom out |
| Toggle Critical Path | `Route` | `onToggleCriticalPath(next)` | Toggles critical path highlight |

**State:** `criticalPathHighlighted` (boolean, default `true`)

**Visual feedback:** When critical path is highlighted, the Route button gets `ring-2 ring-accent` to indicate active state.

All buttons use `variant="secondary"` and `size="icon"`.

The component uses `useReactFlow()` hook to access `fitView`, `zoomIn`, `zoomOut`.

---

### GraphLegend (`components/graph/graph-legend.tsx`)

Bottom bar pinned below the graph canvas.

#### Left Side -- Role Legend Items

| Label | Dot Color |
|-------|-----------|
| Critical Path | `bg-red-500` |
| Bottleneck | `bg-orange-500` |
| Ready | `bg-green-500` |
| Normal | `bg-gray-400` |

Rendered as a horizontal list with colored dots + labels.

#### Right Side -- Summary Counts

Computed from the `nodes` prop by filtering on `role`:
- `Critical Path: {N}` -- count of nodes with `role === 'critical'`
- `Ready: {N}` -- count of nodes with `role === 'ready'`
- `Bottlenecks: {N}` -- count of nodes with `role === 'bottleneck'`

---

## Data Model

### GraphNodeData (`data/graph-nodes.ts`)

```typescript
interface GraphNodeData {
  id: string
  title: string
  status: 'open' | 'in_progress' | 'ready' | 'done'
  role: 'critical' | 'bottleneck' | 'ready' | 'normal'
  priority: number
  assignee?: string
  type: string
}
```

### GraphEdge (`data/graph-nodes.ts`)

```typescript
interface GraphEdge {
  source: string
  target: string
}
```

**Demo data:** 10 nodes, 10 edges representing a dependency tree rooted at `bd-40` (Database Schema).

---

## Conditional Rendering States

| Condition | Behavior |
|-----------|----------|
| No nodes | Graph renders empty canvas with dot background (no empty-state handling) |
| Critical path toggle OFF | All edges render as gray, no animation |
| Critical path toggle ON | Edges between two `role=critical` nodes get red + animated |
| Node has no assignee | Assignee span hidden |
| Single node graph | Dagre layout works, node centered |

---

## Gaps vs Production API/Events

### Data Fetching

| Gap | Current (Demo) | Production Target |
|-----|---------------|-------------------|
| Data source | Static `graphNodes`/`graphEdges` import | TanStack Query fetching `GET /api/projects/:projectId/graph` |
| Graph data shape | `GraphNodeData` + `GraphEdge` arrays | API returns `{ nodes, edges, insights }` with `insights.critical_path`, `insights.bottlenecks`, `insights.ready` |
| Critical path detection | Based on `role === 'critical'` in static data | API provides `insights.critical_path` array of node IDs; edges should be computed from path sequence |
| Bottleneck detection | Based on `role === 'bottleneck'` in static data | API provides `insights.bottlenecks` with betweenness centrality scores |
| Ready nodes | Based on `role === 'ready'` in static data | API provides `insights.ready` array |
| `bv --robot-plan` data | Not used | `GET /api/projects/:projectId/graph/plan` provides parallel execution tracks |

### Real-time Updates

| Gap | Details |
|-----|---------|
| `beads:changed` event | Should trigger TanStack Query invalidation to refetch graph data |
| `epic:updated` event | Should update node status in real time without full refetch |
| No Socket.IO connection | Demo has no socket integration |

### Missing Features

| Feature | Details |
|---------|---------|
| Node click interaction | No click handler on nodes (could open epic detail) |
| Edge type labels | API returns `type: 'blocks'` on edges; not displayed |
| Priority visualization | `priority` field exists on nodes but not visually represented |
| Node type badge | `type` field (task/feature/epic) not displayed on nodes |
| Search/filter | No way to find specific nodes in large graphs |
| Triage panel | `GET /api/projects/:projectId/graph/triage` endpoint exists but no UI |
| Graph refresh button | No manual refresh; stale data possible |
| Loading/error states | No loading skeleton or error boundary |
| Zoom level indicator | No display of current zoom percentage |
| Minimap | React Flow supports minimap panel but not used |
| Node grouping by track | `bv --robot-plan` provides parallel tracks; no visual grouping |

---

## Integration Checklist

- [ ] Replace static data with TanStack Query: `useQuery({ queryKey: ['graph', projectId], queryFn: fetchGraph })`
- [ ] Map API response `insights.critical_path` to determine critical edges (instead of relying on `role` field)
- [ ] Add Socket.IO listener for `beads:changed` to invalidate `['graph', projectId]` query key
- [ ] Add Socket.IO listener for `epic:updated` to optimistically update node status
- [ ] Add loading skeleton while graph data is being fetched
- [ ] Add error boundary / error state for failed fetches
- [ ] Add node click handler to navigate to epic detail or open sheet
- [ ] Display `priority` on nodes (e.g., P0 badge or color intensity)
- [ ] Display `type` on nodes (e.g., small badge or icon)
- [ ] Consider adding React Flow `MiniMap` for large graphs
- [ ] Add `fitView` call on data change (nodes added/removed)
- [ ] Wire up `GET /api/projects/:projectId/graph/triage` for triage recommendations panel
- [ ] Add keyboard shortcuts (e.g., `f` for fit view, `c` for toggle critical path)
