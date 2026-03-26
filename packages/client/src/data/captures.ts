export type CaptureStatus = 'pending' | 'triaged' | 'deferred' | 'dismissed'

export interface Capture {
  id: string
  text: string
  userId: string
  status: CaptureStatus
  createdAt: number
}

const now = Math.floor(Date.now() / 1000)
const m = (mins: number) => now - mins * 60
const h = (hours: number) => now - hours * 3600

export const captures: Capture[] = [
  { id: 'cap-1', text: 'Add rate limiting to webhook endpoints — getting spammed by retry loops', userId: 'u-1', status: 'pending', createdAt: m(5) },
  { id: 'cap-2', text: 'Bug: Safari login fails with 3rd party cookie blocking', userId: 'u-2', status: 'pending', createdAt: m(45) },
  { id: 'cap-3', text: 'Need keyboard shortcuts for power users — Cmd+K for search, Cmd+N for capture', userId: 'u-3', status: 'pending', createdAt: h(2) },
  { id: 'cap-4', text: 'Agent session replay — ability to replay completed sessions step by step', userId: 'u-4', status: 'pending', createdAt: h(3) },
  { id: 'cap-5', text: 'Consider adding Slack integration for PR review notifications', userId: 'u-2', status: 'deferred', createdAt: h(8) },
  { id: 'cap-6', text: 'Refactor DB connection pool — currently opens too many connections under load', userId: 'u-1', status: 'deferred', createdAt: h(12) },
  { id: 'cap-7', text: 'Mobile responsive design for dashboard — team checks on phone sometimes', userId: 'u-3', status: 'triaged', createdAt: h(24) },
  { id: 'cap-8', text: 'Add epic template system — reuse common epic structures', userId: 'u-2', status: 'pending', createdAt: h(1) },
]

export function getCapturesByStatus(status: CaptureStatus): Capture[] {
  return captures.filter((c) => c.status === status)
}

export function getPendingCount(): number {
  return captures.filter((c) => c.status === 'pending').length
}
