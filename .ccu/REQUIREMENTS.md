# Requirements — Activity + Metrics Page (replacing Graph)

## REQ-01: Activity Feed (left panel, 45%) — ACTIVE
- Display recent project activity from `activity_log` table
- Show: user avatar, action description, detail (title/name), epic context, timestamp
- Action types: capture_created, epic_created, session_started, session_completed, session_failed, pr_created, pr_merged, bead_status_changed
- Each action type has a distinct icon and color
- Clickable rows (navigate to related resource — epic, session, PR)
- Failed sessions show error reason inline

## REQ-02: Metrics Panel (right panel, 55%) — ACTIVE
- **Top cards (2x2 grid):** Success rate, active agents, avg session duration, PR cycle time
- **Epic progress:** Horizontal status bars (done, in_review, in_progress, ready, blocked)
- **Capture pipeline:** Pending / triaged / deferred counts
- **PR summary:** Open vs merged counts
- **Token usage + cost estimate**

## REQ-03: Data Fetching — ACTIVE
- New API endpoint: `GET /api/projects/:projectId/activity` — returns activity_log entries, paginated
- New API endpoint: `GET /api/projects/:projectId/metrics` — returns aggregated stats (sessions, captures, epics, PRs)
- TanStack Query with 30s refetch interval + refetch on window focus
- No real-time Socket.IO for v1 (upgrade path exists)

## REQ-04: Navigation — ACTIVE
- Replace "Graph" nav item with "Activity" (Activity icon from lucide)
- Route: `/activity`
- Graph page files kept but unlinked from navigation/routing

## REQ-05: Layout — ACTIVE
- Split view: 45% feed / 55% metrics
- Feed scrolls independently, metrics panel scrolls independently
- Responsive: on narrow screens, stack vertically (feed on top, metrics below) — DEFERRED

## OUT OF SCOPE
- Real-time Socket.IO updates (use polling for v1)
- Deleting graph page code (keep for potential reuse)
- User filtering on the activity feed
- Date range picker for metrics
- Export/download metrics
