export interface GraphNodeData {
  id: string
  title: string
  status: 'open' | 'in_progress' | 'ready' | 'done'
  role: 'critical' | 'bottleneck' | 'ready' | 'normal'
  priority: number
  assignee?: string
  type: string
}

export interface GraphEdge {
  source: string
  target: string
}

export const graphNodes: GraphNodeData[] = [
  { id: 'bd-40', title: 'Database Schema', status: 'done', role: 'critical', priority: 0, assignee: 'Trung', type: 'task' },
  { id: 'bd-41', title: 'Auth API', status: 'in_progress', role: 'critical', priority: 1, assignee: 'Trung', type: 'feature' },
  { id: 'bd-42', title: 'Rate Limiting', status: 'ready', role: 'bottleneck', priority: 0, assignee: 'BlueLake', type: 'feature' },
  { id: 'bd-43', title: 'Auth Tests', status: 'open', role: 'normal', priority: 1, assignee: 'Hoa', type: 'task' },
  { id: 'bd-44', title: 'Rate Limit Tests', status: 'open', role: 'normal', priority: 1, type: 'task' },
  { id: 'bd-45', title: 'E2E Test Suite', status: 'open', role: 'critical', priority: 1, type: 'task' },
  { id: 'bd-46', title: 'Search Service', status: 'in_progress', role: 'normal', priority: 1, assignee: 'BlueLake', type: 'feature' },
  { id: 'bd-47', title: 'Cache Layer', status: 'open', role: 'bottleneck', priority: 2, assignee: 'Duc', type: 'feature' },
  { id: 'bd-48', title: 'Notifications', status: 'ready', role: 'ready', priority: 1, assignee: 'Minh', type: 'feature' },
  { id: 'bd-49', title: 'Webhook System', status: 'open', role: 'normal', priority: 2, type: 'feature' },
]

export const graphEdges: GraphEdge[] = [
  { source: 'bd-40', target: 'bd-41' },
  { source: 'bd-40', target: 'bd-42' },
  { source: 'bd-41', target: 'bd-43' },
  { source: 'bd-42', target: 'bd-44' },
  { source: 'bd-43', target: 'bd-45' },
  { source: 'bd-44', target: 'bd-45' },
  { source: 'bd-40', target: 'bd-46' },
  { source: 'bd-40', target: 'bd-47' },
  { source: 'bd-41', target: 'bd-48' },
  { source: 'bd-48', target: 'bd-49' },
]
