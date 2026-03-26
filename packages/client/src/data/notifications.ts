export interface Notification {
  id: string
  type: 'agent_complete' | 'pr_ready' | 'review_needed' | 'question_waiting' | 'merge_complete'
  title: string
  body: string
  link: string
  read: boolean
  createdAt: number
}

const now = Math.floor(Date.now() / 1000)

export const notifications: Notification[] = [
  { id: 'n-1', type: 'question_waiting', title: 'Agent needs input', body: 'RedStone asks about cache invalidation strategy', link: '/agents/ses-2', read: false, createdAt: now - 120 },
  { id: 'n-2', type: 'pr_ready', title: 'PR #47 ready for review', body: 'Session Timeout fix — approved by AI reviewer', link: '/review/47', read: false, createdAt: now - 3600 },
  { id: 'n-3', type: 'review_needed', title: 'Changes requested on PR #45', body: 'Login Page Redesign — 1 security warning', link: '/review/45', read: false, createdAt: now - 18000 },
  { id: 'n-4', type: 'agent_complete', title: 'Agent completed', body: 'PurpleBear finished Epic Kanban Board — PR #38 created', link: '/agents/ses-5', read: true, createdAt: now - 172800 },
  { id: 'n-5', type: 'merge_complete', title: 'PR #35 merged', body: 'Database Schema v2 merged to main', link: '/board', read: true, createdAt: now - 432000 },
]

export function getUnreadCount(): number {
  return notifications.filter((n) => !n.read).length
}
