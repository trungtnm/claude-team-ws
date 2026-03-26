export type UiStatus = 'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done'
export type Priority = 0 | 1 | 2 | 3
export type EpicType = 'feature' | 'bug' | 'task' | 'docs'

export interface Epic {
  id: string
  beadId: string
  title: string
  description: string
  uiStatus: UiStatus
  priority: Priority
  type: EpicType
  labels: string[]
  assigneeId: string
  beadProgress: { total: number; done: number }
  agentStatus?: 'running' | 'waiting_input' | null
  activeSessionId?: string
  prUrl?: string
  prNumber?: number
  prStatus?: 'pending_review' | 'changes_requested' | 'approved' | 'merged'
  gitBranch?: string
  createdAt: number
  updatedAt: number
  acceptanceCriteria?: string[]
  sourceCaptures?: {
    text: string
    author: string
    createdAt: number
    attachments?: { name: string; type: string; size: string; preview?: string }[]
  }[]
}

const now = Math.floor(Date.now() / 1000)
const h = (hours: number) => now - hours * 3600
const d = (days: number) => now - days * 86400

export const epics: Epic[] = [
  // Blocked (3)
  {
    id: 'epic-1', beadId: 'ctw-a01', title: 'WebSocket Reconnection', description: 'Implement automatic WebSocket reconnection with exponential backoff. Handle connection drops gracefully and re-subscribe to rooms.', uiStatus: 'blocked', priority: 1, type: 'feature', labels: ['frontend', 'reliability'], assigneeId: 'u-3', beadProgress: { total: 4, done: 0 }, createdAt: h(8), updatedAt: h(8),
    acceptanceCriteria: ['Auto-reconnect within 5s', 'Exponential backoff up to 30s', 'Room re-subscription on reconnect', 'Visual indicator during disconnect'],
  },
  {
    id: 'epic-2', beadId: 'ctw-a02', title: 'Audit Log Export', description: 'Add CSV/JSON export for the activity log. PM/TechLead can download filtered activity data.', uiStatus: 'blocked', priority: 2, type: 'feature', labels: ['backend', 'compliance'], assigneeId: 'u-2', beadProgress: { total: 3, done: 0 }, createdAt: h(6), updatedAt: h(6),
    acceptanceCriteria: ['CSV export with date range filter', 'JSON export option', 'Role-based access (PM/TechLead only)'],
  },
  {
    id: 'epic-3', beadId: 'ctw-a03', title: 'Dark/Light Theme Toggle', description: 'Add theme switcher. Currently dark-only. Support system preference detection.', uiStatus: 'blocked', priority: 3, type: 'feature', labels: ['frontend', 'ux'], assigneeId: 'u-4', beadProgress: { total: 5, done: 0 }, createdAt: d(1), updatedAt: d(1),
  },
  // Ready (3)
  {
    id: 'epic-4', beadId: 'ctw-a04', title: 'Rate Limiting Middleware', description: 'Add rate limiting to all public API endpoints. Use express-rate-limit with Redis store for distributed limiting.', uiStatus: 'ready', priority: 0, type: 'feature', labels: ['backend', 'security'], assigneeId: 'u-1', beadProgress: { total: 5, done: 0 }, createdAt: d(2), updatedAt: h(4),
    acceptanceCriteria: ['Rate limiter middleware', 'Per-endpoint configurable limits', 'Redis store integration', 'Rate limit headers in responses', 'Integration tests'],
    sourceCaptures: [
      {
        text: 'Add rate limiting to webhook endpoints — getting spammed by retry loops',
        author: 'Trung Tran', createdAt: h(48),
        attachments: [
          { name: 'webhook-spam-logs.png', type: 'image/png', size: '245 KB', preview: 'https://placehold.co/400x200/1c1a17/f59e0b?text=Webhook+Logs' },
          { name: 'rate-limit-analysis.pdf', type: 'application/pdf', size: '1.2 MB' },
        ],
      },
    ],
  },
  {
    id: 'epic-5', beadId: 'ctw-a05', title: 'Notification System', description: 'In-app notifications for agent completion, PR ready, review needed. Bell icon with unread badge.', uiStatus: 'ready', priority: 1, type: 'feature', labels: ['fullstack'], assigneeId: 'u-3', beadProgress: { total: 6, done: 1 }, createdAt: d(3), updatedAt: h(12),
    acceptanceCriteria: ['Bell icon with unread count', 'Notification dropdown', 'Mark as read / mark all', 'Socket.IO push', 'Notification preferences'],
  },
  {
    id: 'epic-6', beadId: 'ctw-a06', title: 'Agent Mail Thread Viewer', description: 'UI to browse Agent Mail threads per epic. Show inter-agent communication and file reservations.', uiStatus: 'ready', priority: 1, type: 'feature', labels: ['frontend', 'agent-mail'], assigneeId: 'u-4', beadProgress: { total: 4, done: 0 }, createdAt: d(2), updatedAt: h(10),
  },
  // In Progress (3)
  {
    id: 'epic-7', beadId: 'ctw-a07', title: 'Search API Integration', description: 'Full-text search across captures and epics using CASS. Add search bar to header with instant results.', uiStatus: 'in_progress', priority: 1, type: 'feature', labels: ['fullstack', 'search'], assigneeId: 'u-1', beadProgress: { total: 5, done: 2 }, agentStatus: 'running', activeSessionId: 'ses-1', gitBranch: 'epic/search-api', createdAt: d(5), updatedAt: h(1),
    acceptanceCriteria: ['CASS search wrapper', 'Search results page', 'Header search bar', 'Keyboard shortcut (Cmd+K)', 'Highlighted results'],
    sourceCaptures: [
      { text: 'Need keyboard shortcuts for power users — Cmd+K for search, Cmd+N for capture', author: 'Hoa Nguyen', createdAt: h(72) },
      {
        text: 'Can we add full-text search? Hard to find past captures and epics',
        author: 'Minh Le', createdAt: h(96),
        attachments: [
          { name: 'search-ux-mockup.png', type: 'image/png', size: '180 KB', preview: 'https://placehold.co/400x200/1c1a17/3b82f6?text=Search+Mockup' },
        ],
      },
    ],
  },
  {
    id: 'epic-8', beadId: 'ctw-a08', title: 'Cache Layer', description: 'Add Redis caching for frequently accessed data: epic lists, graph data, user sessions.', uiStatus: 'in_progress', priority: 2, type: 'feature', labels: ['backend', 'performance'], assigneeId: 'u-4', beadProgress: { total: 4, done: 1 }, agentStatus: 'waiting_input', activeSessionId: 'ses-2', gitBranch: 'epic/cache-layer', createdAt: d(4), updatedAt: h(2),
  },
  {
    id: 'epic-9', beadId: 'ctw-a09', title: 'Auth Refactor', description: 'Migrate from API key auth to OAuth 2.0 + session tokens. Support GitHub SSO for team members.', uiStatus: 'in_progress', priority: 1, type: 'task', labels: ['backend', 'security'], assigneeId: 'u-1', beadProgress: { total: 7, done: 4 }, agentStatus: 'running', activeSessionId: 'ses-3', gitBranch: 'epic/auth-refactor', createdAt: d(7), updatedAt: h(3),
  },
  // In Review (2)
  {
    id: 'epic-10', beadId: 'ctw-a10', title: 'Login Page Redesign', description: 'New login page with GitHub SSO button, API key fallback, and remember me checkbox.', uiStatus: 'in_review', priority: 1, type: 'feature', labels: ['frontend', 'auth'], assigneeId: 'u-3', beadProgress: { total: 4, done: 4 }, prUrl: 'https://github.com/team/ctw/pull/45', prNumber: 45, prStatus: 'changes_requested', gitBranch: 'epic/login-redesign', createdAt: d(10), updatedAt: h(5),
    acceptanceCriteria: ['GitHub SSO button', 'API key input fallback', 'Remember me checkbox', 'Loading states'],
    sourceCaptures: [
      {
        text: 'Bug: Safari login fails with 3rd party cookie blocking',
        author: 'Minh Le', createdAt: d(12),
        attachments: [
          { name: 'safari-error-screenshot.png', type: 'image/png', size: '312 KB', preview: 'https://placehold.co/400x200/1c1a17/ef4444?text=Safari+Error' },
          { name: 'console-logs.txt', type: 'text/plain', size: '4 KB' },
        ],
      },
      { text: 'We should support GitHub SSO for the team', author: 'Trung Tran', createdAt: d(14) },
    ],
  },
  {
    id: 'epic-11', beadId: 'ctw-a11', title: 'Bug: Session Timeout', description: 'Fix: JWT tokens not refreshing on activity, causing unexpected logouts after 30min.', uiStatus: 'in_review', priority: 0, type: 'bug', labels: ['backend', 'auth'], assigneeId: 'u-4', beadProgress: { total: 3, done: 3 }, prUrl: 'https://github.com/team/ctw/pull/47', prNumber: 47, prStatus: 'approved', gitBranch: 'fix/session-timeout', createdAt: d(3), updatedAt: h(1),
  },
  // Done (3)
  {
    id: 'epic-12', beadId: 'ctw-a12', title: 'Epic Kanban Board', description: 'Drag-and-drop Kanban board with 5 status columns. Cards show priority, progress, agent status.', uiStatus: 'done', priority: 1, type: 'feature', labels: ['frontend'], assigneeId: 'u-1', beadProgress: { total: 6, done: 6 }, prStatus: 'merged', prNumber: 38, gitBranch: 'epic/kanban-board', createdAt: d(14), updatedAt: d(2),
  },
  {
    id: 'epic-13', beadId: 'ctw-a13', title: 'Capture Inbox', description: 'Sidebar component for quick idea capture. Supports triage to epic and deferred states.', uiStatus: 'done', priority: 1, type: 'feature', labels: ['fullstack'], assigneeId: 'u-3', beadProgress: { total: 5, done: 5 }, prStatus: 'merged', prNumber: 41, createdAt: d(12), updatedAt: d(3),
  },
  {
    id: 'epic-14', beadId: 'ctw-a14', title: 'Database Schema v2', description: 'Migration to add repos, agent_queue, knowledge_rules, webhook_configs tables.', uiStatus: 'done', priority: 0, type: 'task', labels: ['backend', 'database'], assigneeId: 'u-1', beadProgress: { total: 4, done: 4 }, prStatus: 'merged', prNumber: 35, createdAt: d(15), updatedAt: d(5),
  },
]

export const columns: { id: UiStatus; label: string }[] = [
  { id: 'blocked', label: 'Blocked' },
  { id: 'ready', label: 'Ready' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
]

export function getEpicsByStatus(status: UiStatus): Epic[] {
  return epics.filter((e) => e.uiStatus === status)
}
