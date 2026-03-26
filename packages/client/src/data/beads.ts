export type BeadStatus = 'open' | 'in_progress' | 'done' | 'blocked'
export type BeadType = 'task' | 'bug' | 'spike'

export interface Bead {
  id: string
  epicId: string
  title: string
  description: string
  status: BeadStatus
  priority: number
  type: BeadType
  assigneeId?: string
  labels: string[]
  dependencies: string[] // bead IDs this depends on
  createdAt: number
  updatedAt: number
}

const now = Math.floor(Date.now() / 1000)
const h = (hours: number) => now - hours * 3600
const d = (days: number) => now - days * 86400

export const beads: Bead[] = [
  // epic-7: Search API Integration (in_progress, 5 beads, 2 done)
  {
    id: 'bead-7a', epicId: 'epic-7', title: 'CASS service wrapper', description: 'Create a TypeScript wrapper around the CASS CLI tool using execFile. Expose search, index, and status methods.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['backend', 'search'],
    dependencies: [], createdAt: d(5), updatedAt: d(3),
  },
  {
    id: 'bead-7b', epicId: 'epic-7', title: 'Search route handler', description: 'Add GET /api/search endpoint with query, filters, and pagination. Validate with zod schema.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['backend', 'search'],
    dependencies: ['bead-7a'], createdAt: d(5), updatedAt: d(2),
  },
  {
    id: 'bead-7c', epicId: 'epic-7', title: 'Search results page', description: 'Build the search results page with filters sidebar, result cards, and pagination controls.',
    status: 'in_progress', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['frontend', 'search'],
    dependencies: ['bead-7b'], createdAt: d(4), updatedAt: h(1),
  },
  {
    id: 'bead-7d', epicId: 'epic-7', title: 'Header search bar (Cmd+K)', description: 'Add a search input to the header with Cmd+K keyboard shortcut to focus. Show instant results dropdown.',
    status: 'open', priority: 2, type: 'task', assigneeId: 'u-1', labels: ['frontend', 'search'],
    dependencies: ['bead-7b'], createdAt: d(4), updatedAt: d(4),
  },
  {
    id: 'bead-7e', epicId: 'epic-7', title: 'Result highlighting', description: 'Highlight matching query terms in search result snippets using mark tags.',
    status: 'open', priority: 3, type: 'task', labels: ['frontend', 'search'],
    dependencies: ['bead-7c'], createdAt: d(4), updatedAt: d(4),
  },

  // epic-8: Cache Layer (in_progress, 4 beads, 1 done)
  {
    id: 'bead-8a', epicId: 'epic-8', title: 'Redis connection manager', description: 'Set up Redis client with connection pooling, health checks, and reconnection logic.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-4', labels: ['backend', 'performance'],
    dependencies: [], createdAt: d(4), updatedAt: d(3),
  },
  {
    id: 'bead-8b', epicId: 'epic-8', title: 'Cache middleware for epic routes', description: 'Add Express middleware that checks Redis cache before hitting the database for epic list and detail endpoints.',
    status: 'in_progress', priority: 1, type: 'task', assigneeId: 'u-4', labels: ['backend', 'performance'],
    dependencies: ['bead-8a'], createdAt: d(4), updatedAt: h(2),
  },
  {
    id: 'bead-8c', epicId: 'epic-8', title: 'Cache invalidation on mutations', description: 'Invalidate relevant cache keys when epics are created, updated, or deleted.',
    status: 'blocked', priority: 1, type: 'task', assigneeId: 'u-4', labels: ['backend', 'performance'],
    dependencies: ['bead-8b'], createdAt: d(3), updatedAt: h(4),
  },
  {
    id: 'bead-8d', epicId: 'epic-8', title: 'Graph data caching', description: 'Cache graph node computations with TTL-based expiry. Graph data changes infrequently.',
    status: 'open', priority: 2, type: 'task', labels: ['backend', 'performance'],
    dependencies: ['bead-8a'], createdAt: d(3), updatedAt: d(3),
  },

  // epic-9: Auth Refactor (in_progress, 7 beads, 4 done)
  {
    id: 'bead-9a', epicId: 'epic-9', title: 'OAuth 2.0 provider setup', description: 'Configure OAuth 2.0 provider with GitHub as identity provider. Set up client ID/secret management.',
    status: 'done', priority: 0, type: 'task', assigneeId: 'u-1', labels: ['backend', 'security'],
    dependencies: [], createdAt: d(7), updatedAt: d(6),
  },
  {
    id: 'bead-9b', epicId: 'epic-9', title: 'Session token service', description: 'Replace API key auth with JWT session tokens. Implement token generation, validation, and refresh.',
    status: 'done', priority: 0, type: 'task', assigneeId: 'u-1', labels: ['backend', 'security'],
    dependencies: ['bead-9a'], createdAt: d(7), updatedAt: d(5),
  },
  {
    id: 'bead-9c', epicId: 'epic-9', title: 'Auth middleware migration', description: 'Update authenticate middleware to accept both JWT and legacy API keys during migration period.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['backend', 'security'],
    dependencies: ['bead-9b'], createdAt: d(6), updatedAt: d(4),
  },
  {
    id: 'bead-9d', epicId: 'epic-9', title: 'GitHub SSO callback handler', description: 'Implement /auth/github/callback endpoint for OAuth code exchange and user provisioning.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['backend', 'security'],
    dependencies: ['bead-9a'], createdAt: d(6), updatedAt: d(3),
  },
  {
    id: 'bead-9e', epicId: 'epic-9', title: 'Token refresh endpoint', description: 'Add POST /auth/refresh endpoint with rotation. Old refresh tokens are invalidated on use.',
    status: 'in_progress', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['backend', 'security'],
    dependencies: ['bead-9b'], createdAt: d(5), updatedAt: h(3),
  },
  {
    id: 'bead-9f', epicId: 'epic-9', title: 'Logout and session revocation', description: 'Implement logout endpoint that revokes all active sessions for the user.',
    status: 'open', priority: 2, type: 'task', labels: ['backend', 'security'],
    dependencies: ['bead-9e'], createdAt: d(5), updatedAt: d(5),
  },
  {
    id: 'bead-9g', epicId: 'epic-9', title: 'API key deprecation notice', description: 'Add deprecation warning headers when API key auth is used. Log usage for migration tracking.',
    status: 'open', priority: 3, type: 'task', labels: ['backend', 'security'],
    dependencies: ['bead-9c'], createdAt: d(5), updatedAt: d(5),
  },

  // epic-10: Login Page Redesign (in_review, 4 beads, 4 done)
  {
    id: 'bead-10a', epicId: 'epic-10', title: 'Login page layout', description: 'New centered card layout with brand logo, form fields, and SSO section.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-3', labels: ['frontend', 'auth'],
    dependencies: [], createdAt: d(10), updatedAt: d(8),
  },
  {
    id: 'bead-10b', epicId: 'epic-10', title: 'GitHub SSO button', description: 'Add GitHub OAuth sign-in button with loading state and error handling.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-3', labels: ['frontend', 'auth'],
    dependencies: ['bead-10a'], createdAt: d(10), updatedAt: d(7),
  },
  {
    id: 'bead-10c', epicId: 'epic-10', title: 'API key fallback input', description: 'Collapsible API key input below the SSO button for backwards compatibility.',
    status: 'done', priority: 2, type: 'task', assigneeId: 'u-3', labels: ['frontend', 'auth'],
    dependencies: ['bead-10a'], createdAt: d(9), updatedAt: d(6),
  },
  {
    id: 'bead-10d', epicId: 'epic-10', title: 'Remember me & loading states', description: 'Add remember me checkbox and proper loading/error states for all auth flows.',
    status: 'done', priority: 2, type: 'task', assigneeId: 'u-3', labels: ['frontend', 'auth'],
    dependencies: ['bead-10b', 'bead-10c'], createdAt: d(9), updatedAt: d(5),
  },

  // epic-12: Epic Kanban Board (done, 6 beads, 6 done)
  {
    id: 'bead-12a', epicId: 'epic-12', title: 'Board column component', description: 'Create BoardColumn component with header, count badge, and droppable area.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['frontend'],
    dependencies: [], createdAt: d(14), updatedAt: d(10),
  },
  {
    id: 'bead-12b', epicId: 'epic-12', title: 'Epic card component', description: 'Card showing priority, title, progress bar, agent status, and assignee avatar.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['frontend'],
    dependencies: ['bead-12a'], createdAt: d(14), updatedAt: d(9),
  },
  {
    id: 'bead-12c', epicId: 'epic-12', title: 'Drag and drop with dnd-kit', description: 'Integrate dnd-kit for cross-column drag and drop with smooth animations.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['frontend'],
    dependencies: ['bead-12b'], createdAt: d(13), updatedAt: d(7),
  },
  {
    id: 'bead-12d', epicId: 'epic-12', title: 'Filter bar', description: 'Add type and label filters above the board columns.',
    status: 'done', priority: 2, type: 'task', assigneeId: 'u-1', labels: ['frontend'],
    dependencies: ['bead-12a'], createdAt: d(12), updatedAt: d(6),
  },
  {
    id: 'bead-12e', epicId: 'epic-12', title: 'Board page layout', description: 'Assemble the board page with header, filters, and responsive column grid.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-1', labels: ['frontend'],
    dependencies: ['bead-12c', 'bead-12d'], createdAt: d(11), updatedAt: d(4),
  },
  {
    id: 'bead-12f', epicId: 'epic-12', title: 'Board E2E tests', description: 'Playwright tests for drag-and-drop, filtering, and card click-through.',
    status: 'done', priority: 2, type: 'task', assigneeId: 'u-1', labels: ['frontend', 'testing'],
    dependencies: ['bead-12e'], createdAt: d(10), updatedAt: d(2),
  },

  // epic-11: Bug: Session Timeout (in_review, 3 beads, 3 done)
  {
    id: 'bead-11a', epicId: 'epic-11', title: 'Reproduce timeout bug', description: 'Create integration test that demonstrates the JWT not refreshing on activity.',
    status: 'done', priority: 0, type: 'bug', assigneeId: 'u-4', labels: ['backend', 'auth'],
    dependencies: [], createdAt: d(3), updatedAt: d(2),
  },
  {
    id: 'bead-11b', epicId: 'epic-11', title: 'Fix token refresh logic', description: 'Update auth middleware to refresh token on each authenticated request within the sliding window.',
    status: 'done', priority: 0, type: 'bug', assigneeId: 'u-4', labels: ['backend', 'auth'],
    dependencies: ['bead-11a'], createdAt: d(3), updatedAt: d(1),
  },
  {
    id: 'bead-11c', epicId: 'epic-11', title: 'Regression tests', description: 'Add integration tests verifying token refresh behavior and session persistence.',
    status: 'done', priority: 1, type: 'task', assigneeId: 'u-4', labels: ['backend', 'testing'],
    dependencies: ['bead-11b'], createdAt: d(2), updatedAt: h(1),
  },
]

export function getBeadsByEpicId(epicId: string): Bead[] {
  return beads.filter((b) => b.epicId === epicId)
}

export function getBeadById(beadId: string): Bead | undefined {
  return beads.find((b) => b.id === beadId)
}
