# UI Demo Inventory

Full catalog of every file in `ui/src/`. All files have been read and analyzed.

---

## Stack Profile

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | React | 19 |
| Build | Vite | 6 |
| Language | TypeScript | 5.7+ |
| Styling | Tailwind CSS | 4 |
| Component library | shadcn/ui (Radix primitives) | 13 components |
| State (UI) | Zustand | 5 |
| Routing | react-router-dom | 7.1 |
| Icons | lucide-react | 0.469 |
| Date formatting | date-fns | 4.1 |
| Toasts | sonner | 1.7 |
| Drag-and-drop | @dnd-kit/core + sortable | 6.3 / 10.0 |
| Graph visualization | @xyflow/react + @dagrejs/dagre | 12.4 / 1.1 |
| Diff rendering | react-diff-viewer-continued | 4.0 |
| CSS utility | clsx + tailwind-merge | via `cn()` helper |

**No server-state library in demo** -- TanStack Query is specified in CLAUDE.md for production but not used in the demo. All data is static mock imports.

**No Socket.IO client in demo** -- real-time events are documented in the wireframes/API spec but not wired in the demo.

---

## Entry Points

| File | Purpose |
|------|---------|
| `src/main.tsx` | React root. BrowserRouter wraps `<App />`. Imports `index.css`. |
| `src/app.tsx` | Route definitions. All pages lazy-loaded with `React.lazy()` + `Suspense`. |
| `src/index.css` | Warm Workshop theme tokens, Tailwind import, custom animations, scrollbar styling. |
| `src/lib/utils.ts` | `cn()` helper (clsx + tailwind-merge). |

---

## Pages (7 total)

### 1. BoardPage (`/board`)
- **File:** `src/pages/board-page.tsx`
- **Route:** `/board` (also default via `Navigate` from `/`)
- **Purpose:** Epic Kanban board with 5 status columns (blocked, ready, in_progress, in_review, done)
- **Child components:** `FilterBar`, `BoardColumn`, `EpicDetailSheet`, `EpicCreateDialog`
- **Data consumed:** `epics`, `columns` from `data/epics.ts`
- **Store:** `useBoardStore` (filterType, filterLabel, searchQuery)
- **Corresponding API:** `GET /api/projects/:projectId/epics`

### 2. CapturesPage (`/captures`)
- **File:** `src/pages/captures-page.tsx` (default export)
- **Route:** `/captures`
- **Purpose:** Full-page capture inbox with tabs (pending / deferred / all), batch operations (select all, triage all, defer all, dismiss all), and triage dialog
- **Child components:** `CaptureCard`, `TriageDialog`
- **Data consumed:** `Capture` type from `data/captures.ts`
- **Store:** `useCaptureStore` (captures array, selectedIds, composer state)
- **Corresponding API:** `GET /api/projects/:projectId/captures`, `PATCH .../captures/:id`

### 3. AgentsPage (`/agents`)
- **File:** `src/pages/agents-page.tsx` (default export)
- **Route:** `/agents`
- **Purpose:** Split-panel agent session manager. Left panel: session list with tabs (active/queued/history) and search. Right panel: selected session detail with stream preview, live metrics (context window gauge, tokens, cost), and AskUserQuestion banner.
- **Child components:** `AgentStreamView`, `SessionStatsBar`, `AskQuestionDialog`, inline `SessionListItem` sub-component
- **Data consumed:** `sessions`, `getSessionsByStatus`, `AgentSession` from `data/sessions.ts`; `getUserById` from `data/users.ts`
- **Corresponding API:** `GET /api/projects/:projectId/sessions`, `GET /api/sessions/:sessionId/events`

### 4. AgentStreamPage (`/agents/:sessionId`)
- **File:** `src/pages/agent-stream-page.tsx` (default export)
- **Route:** `/agents/:sessionId`
- **Purpose:** Full-screen agent stream view for a single session. Shows back link, session header with status/model badges, epic/bead context breadcrumb, stream output, stats bar, and question dialog.
- **Child components:** `AgentStreamView`, `SessionStatsBar`, `AskQuestionDialog`
- **Data consumed:** `sessions` from `data/sessions.ts`
- **Corresponding API:** `GET /api/sessions/:sessionId`, `GET /api/sessions/:sessionId/events`

### 5. GraphPage (`/graph`)
- **File:** `src/pages/graph-page.tsx` (default export)
- **Route:** `/graph`
- **Purpose:** Dependency graph visualization using React Flow + dagre auto-layout. Shows node count and edge count in header.
- **Child components:** `DependencyGraph`, `GraphLegend`
- **Data consumed:** `graphNodes`, `graphEdges` from `data/graph-nodes.ts`
- **Corresponding API:** `GET /api/projects/:projectId/graph`

### 6. SettingsPage (`/settings`)
- **File:** `src/pages/settings-page.tsx` (default export)
- **Route:** `/settings`
- **Purpose:** Tabbed settings page with 5 tabs: Project, Repositories, Users, Rules, Webhooks
- **Child components:** `ProjectTab`, `ReposTab`, `UsersTab`, `RulesTab`, `WebhooksTab`
- **Uses:** shadcn `Tabs` component
- **Corresponding API:** Multiple endpoints (project, repos, users, rules, webhooks)

### 7. PrReviewPage (`/review/:prNumber`)
- **File:** `src/pages/pr-review-page.tsx` (default export)
- **Route:** `/review/:prNumber`
- **Purpose:** PR review interface with header (approve/request changes/merge dropdown), context line (epic + agent + branch), and split-panel body (file tree + diff | AI review + comments)
- **Child components:** `PrReviewLayout`
- **Data consumed:** `prReview` from `data/pr-review.ts`
- **Corresponding API:** `GET /api/reviews/:sessionId`, `POST /api/reviews/:sessionId/comment`, `POST /api/reviews/:sessionId/merge`

---

## Components (40 total)

### Layout Components (4)

| File | Component | Purpose |
|------|-----------|---------|
| `components/layout/layout.tsx` | `Layout` | App shell. Vertical flex: Header + AgentAlertBar + `<Outlet />` + Toaster (sonner, dark theme, bottom-right). |
| `components/layout/header.tsx` | `Header` | 48px header bar. Logo ("CT"), project selector dropdown, 5 nav tabs (NavLink), Capture CTA button with `Cmd+J` shortcut, NotificationDropdown, user avatar. Renders `CaptureComposer` dialog. |
| `components/layout/agent-alert-bar.tsx` | `AgentAlertBar` | Amber pulsing banner shown when any agent session has `waiting_input` status. Single agent: shows name + truncated question + Answer button. Multiple: shows count + View All. Dismissible. |
| `components/layout/notification-dropdown.tsx` | `NotificationDropdown` | Bell icon with unread count badge. Dropdown lists notifications with type-specific icons, click-to-navigate, mark-all-read. |

### Board Components (7)

| File | Component | Props | Purpose |
|------|-----------|-------|---------|
| `components/board/board-column.tsx` | `BoardColumn` | `columnId: UiStatus, label: string, epics: Epic[]` | Column container with header (label + count), renders `EpicCard` list or empty state. |
| `components/board/epic-card.tsx` | `EpicCard` | `epic: Epic` | Kanban card. Shows priority badge, type badge, assignee avatar, title, progress bar, agent status indicator (running/waiting), PR link, labels, time ago. Click opens `EpicDetailSheet`. |
| `components/board/filter-bar.tsx` | `FilterBar` | (none) | Type filter (Select), label filter (Select with dynamically derived labels), search input. Reads/writes `useBoardStore`. |
| `components/board/priority-badge.tsx` | `PriorityBadge` | `priority: Priority, className?: string` | Badge with P0-P3 labels and color-coded backgrounds. |
| `components/board/epic-detail-sheet.tsx` | `EpicDetailSheet` | (none, reads store) | Full-width dialog (max-w-5xl). Three tabs: Overview (description, acceptance criteria, beads list, comments), Source Captures (with attachment previews), Dep Tree. Right sidebar: editable status, priority, type, assignee, labels, due date, estimate, branch, PR, sessions. Footer: status-aware action buttons (Start Session / View Session / Review PR / View Summary). |
| `components/board/epic-create-dialog.tsx` | `EpicCreateDialog` | `open, onOpenChange` | Dialog for creating epics. Lists pending captures with checkboxes and search. Selected captures are sent to `TriageDialog` for AI-powered triage. |
| `components/board/bead-list.tsx` | `BeadList` | `epicId: string` | Lists beads for an epic, grouped by status (in_progress, blocked, open first; done collapsible). Each row shows status icon, title, blocker info, priority badge, assignee avatar. Clicking opens `BeadDetailDialog`. |
| `components/board/bead-detail-dialog.tsx` | `BeadDetailDialog` | `bead: Bead | null, open, onOpenChange` | Full bead detail dialog. Clickable status/priority/type badges for inline editing. Description, dependencies (add/remove), labels, assignee (dropdown with all users), timestamps, comments, and status-aware actions (Claim / Start Session / Close / Dep tree). |

### Agent Components (5)

| File | Component | Props | Purpose |
|------|-----------|-------|---------|
| `components/agents/agent-stream-view.tsx` | `AgentStreamView` | `sessionId: string` | Scrollable stream view. Renders `StreamEvent` for each event from `data/agent-stream.ts`. Shows typing indicator for running sessions. |
| `components/agents/stream-event.tsx` | `StreamEvent` | `event: StreamEventType` | Renders a single stream event. System: monospace box. Assistant: text with icon. Tool use: collapsible panel with tool name + input, expandable result. Tool result: code block. Result: success box. Error: error box. |
| `components/agents/session-stats-bar.tsx` | `SessionStatsBar` | `session: AgentSession` | Bottom bar showing turns, files modified, duration, model badge. |
| `components/agents/ask-question-dialog.tsx` | `AskQuestionDialog` | `session, open, onOpenChange` | Modal for answering agent questions. Shows question text, context, radio-button options, "Other" with text input, Skip/Send buttons. |
| `components/agents/session-card.tsx` | `SessionCard` | `session: AgentSession` | Card-per-status rendering: running (live dot, live duration, view/cancel), waiting_input (amber border, question preview, answer/view/cancel), queued (position, requester, cancel/promote), completed (duration, turns, PR link, view), failed (error indicator, view/retry). Each shows epic/bead context breadcrumb. |

### Graph Components (4)

| File | Component | Props | Purpose |
|------|-----------|-------|---------|
| `components/graph/dependency-graph.tsx` | `DependencyGraph` | `graphNodes, graphEdges` | ReactFlowProvider wrapper. Dagre layout (TB direction). Critical path edges are red+animated. Renders custom `GraphNode` + `GraphControls`. |
| `components/graph/graph-node.tsx` | `GraphNode` | `data: GraphNodeData` | 180px custom React Flow node. Role-based border colors (critical=red, bottleneck=orange, ready=green, normal=default). Shows ID (monospace), title, status dot + label, assignee. |
| `components/graph/graph-legend.tsx` | `GraphLegend` | `nodes: GraphNodeData[]` | Bottom bar with role color legend and computed counts (critical, ready, bottleneck). |
| `components/graph/graph-controls.tsx` | `GraphControls` | `onToggleCriticalPath` | Floating button group (top-right): fit view, zoom in, zoom out, toggle critical path highlight. |

### PR Review Components (5)

| File | Component | Props | Purpose |
|------|-----------|-------|---------|
| `components/pr-review/pr-review-layout.tsx` | `PrReviewLayout` | `prReview: PrReview` | Grid layout (1fr + 380px). Left: FileTree + file path header + DiffViewer. Right: AiReviewSummary + CommentThread + "Send to Agent" button. |
| `components/pr-review/file-tree.tsx` | `FileTree` | `files, selectedFile, onSelectFile` | File list with icon, path, +additions/-deletions. Active file has accent left border. |
| `components/pr-review/diff-viewer.tsx` | `DiffViewer` | `file: PrFile` | Wraps `react-diff-viewer-continued` with Warm Workshop dark theme colors. Split view. |
| `components/pr-review/ai-review-summary.tsx` | `AiReviewSummary` | `aiReview` | Card showing UBS pass/fail, security warnings (severity badges), standards pass/fail, verdict. |
| `components/pr-review/comment-thread.tsx` | `CommentThread` | `comments: PrComment[]` | Comment list (AI comments styled differently with bot icon). Textarea for adding new comments. |

### Capture Components (5)

| File | Component | Props | Purpose |
|------|-----------|-------|---------|
| `components/capture/capture-composer.tsx` | `CaptureComposer` | (none, reads store) | Dialog-based composer. Textarea with drag-and-drop + paste support for file attachments. Inline toolbar (attach file, add image, char count). Collapsible priority/type classification section. Submit, Capture & Add Another, Cancel buttons. |
| `components/capture/capture-card.tsx` | `CaptureCard` | `capture, onTriage, onDefer, onDismiss, selected?, onToggleSelect?, highlighted?` | Card with age-based left border (accent <1h, muted <24h, error >24h). Checkbox, full text, author avatar + name + time ago, action buttons (Triage, Defer, Dismiss). |
| `components/capture/capture-inbox.tsx` | `CaptureInbox` | (none) | Sidebar widget showing top 3 pending captures with badge count. "View all captures" link navigates to `/captures`. |
| `components/capture/capture-fab.tsx` | `CaptureFab` | (none) | Fixed-position floating action button (bottom-right). Toggles `CaptureComposer` via store. Pulse animation when no pending captures. `Cmd+J` shortcut. **Note:** Not rendered in current layout -- header CTA replaced it. |
| `components/capture/triage-dialog.tsx` | `TriageDialog` | `captures, open, onOpenChange, onTriaged` | Multi-phase triage wizard. Phase 1 (review): show selected captures, AI triage explanation, Start button. Phase 2 (processing): animated step checklist. Phase 3 (question): agent asks clarifying questions with radio options + skip. Phase 4 (complete): shows generated epic title/description/priority/type/labels, beads breakdown, actions (Start Agent Session, View on Board, Close). |

### Settings Components (6)

| File | Component | Props | Purpose |
|------|-----------|-------|---------|
| `components/settings/project-tab.tsx` | `ProjectTab` | (none) | Project identity (avatar, name, description, ID, slug), workspace paths, agent config (max concurrent, AskUserQuestion mode radio), integrations status (Agent Mail, CM, CASS), data export, danger zone (transfer ownership, delete). |
| `components/settings/repos-tab.tsx` | `ReposTab` | (none) | Repo list with Pull All button and Add Repo button. Each `RepoCard` shows name, status badge, sync status (synced/behind/diverged), URL/path, branch, link mode, uncommitted count, last commit info. Context menu: pull, branches, switch branch, copy path, terminal, remove. |
| `components/settings/add-repo-dialog.tsx` | `AddRepoDialog` | `open, onOpenChange` | Mode toggle (Clone from URL / Link existing). Name, Git URL (clone mode), Path with folder icon (link mode), Branch fields. |
| `components/settings/users-tab.tsx` | `UsersTab` | (none) | User list with role summary header. Each `UserRow` shows avatar, name, email, last active, role badge with permission hint, context menu (change role, copy invite link, remove). Pending users show resend button. `InviteUserDialog` with name/email/role form. |
| `components/settings/rules-tab.tsx` | `RulesTab` | (none) | Knowledge rules list with search, category filter, maturity filter. Each `RuleCard` shows rule text, category/maturity/source badges, confidence bar, helpful/harmful counts, Edit/Test/Approve/Deprecate actions. `RuleDialog` for add/edit with "Improve with AI" button that simulates AI suggestion. Bulk "Approve all candidates" action. |
| `components/settings/webhooks-tab.tsx` | `WebhooksTab` | (none) | Webhook list. Each `WebhookCard` shows type icon, active/disabled badge, delivery health status, masked URL, last triggered, Send Test button, Enable/Disable toggle, event checkboxes, edit URL inline, delete with confirmation. `AddWebhookDialog` with type toggle (Slack/Discord/Telegram), collapsible setup guide per platform, URL input, event selector. |

### shadcn/ui Primitives (13)

| File | Radix Source | Customization |
|------|-------------|---------------|
| `components/ui/button.tsx` | Slot | CVA variants: default, secondary, outline, ghost; sizes: default, sm, icon |
| `components/ui/badge.tsx` | (none) | CVA variants: default, accent, outline, success, warning, error, info |
| `components/ui/card.tsx` | (none) | Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| `components/ui/input.tsx` | (none) | Styled input with focus ring |
| `components/ui/textarea.tsx` | (none) | Styled textarea |
| `components/ui/dialog.tsx` | @radix-ui/react-dialog | Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogOverlay, DialogClose |
| `components/ui/sheet.tsx` | @radix-ui/react-dialog | Sheet, SheetContent (side variants), SheetHeader, SheetTitle, SheetDescription, SheetFooter |
| `components/ui/tabs.tsx` | @radix-ui/react-tabs | Tabs, TabsList, TabsTrigger, TabsContent |
| `components/ui/scroll-area.tsx` | @radix-ui/react-scroll-area | ScrollArea, ScrollBar |
| `components/ui/separator.tsx` | @radix-ui/react-separator | Horizontal/vertical separator |
| `components/ui/tooltip.tsx` | @radix-ui/react-tooltip | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent |
| `components/ui/dropdown-menu.tsx` | @radix-ui/react-dropdown-menu | Full suite: Menu, Trigger, Content, Item, Separator, Label, Sub, Radio, Checkbox |
| `components/ui/select.tsx` | @radix-ui/react-select | Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel |

---

## Stores (4 total)

### 1. `useBoardStore` (board-store.ts)
- **Type:** UI state
- **Shape:** `{ selectedEpicId: string | null, filterType: string, filterLabel: string, searchQuery: string }`
- **Actions:** setSelectedEpicId, setFilterType, setFilterLabel, setSearchQuery
- **Consumers:** BoardPage, FilterBar, EpicCard (write), EpicDetailSheet (read/write)

### 2. `useAgentStore` (agent-store.ts)
- **Type:** UI state
- **Shape:** `{ selectedSessionId: string | null }`
- **Actions:** setSelectedSessionId
- **Consumers:** Not directly used in current pages (AgentsPage manages selection locally)

### 3. `useCaptureStore` (capture-store.ts)
- **Type:** Mixed (UI + mock server state)
- **Shape:** `{ captures: Capture[], composerOpen: boolean, selectedIds: Set<string> }`
- **Actions:** addCapture, updateStatus, dismissCapture, openComposer, closeComposer, toggleComposer, toggleSelected, selectAll, clearSelection
- **Derived:** getPendingCaptures, getDeferredCaptures, getNextPendingCapture
- **Consumers:** Header (toggleComposer), CaptureComposer (composerOpen, closeComposer, addCapture), CapturesPage (full CRUD), CaptureInbox (captures), CaptureFab (composerOpen, toggleComposer, captures), EpicCreateDialog (captures, updateStatus)
- **Note:** Initializes with `captures.filter(c => c.status !== 'triaged')` -- triaged captures are excluded from the demo view

### 4. `useAppStore` (app-store.ts)
- **Type:** UI state
- **Shape:** `{ captureInboxOpen: boolean, activeProjectId: string }`
- **Actions:** toggleCaptureInbox, setCaptureInboxOpen, setActiveProjectId
- **Consumers:** Not actively used in current layout (sidebar was removed in favor of header nav)

---

## Data / Mock Files (9 total)

### 1. `data/epics.ts`
- **Types exported:** `UiStatus`, `Priority`, `EpicType`, `Epic`
- **Interface Epic:** id, beadId, title, description, uiStatus, priority, type, labels[], assigneeId, beadProgress: {total, done}, agentStatus?, activeSessionId?, prUrl?, prNumber?, prStatus?, gitBranch?, createdAt, updatedAt, acceptanceCriteria?[], sourceCaptures?[]
- **Data:** 14 epics across all 5 statuses (3 blocked, 3 ready, 3 in_progress, 2 in_review, 3 done)
- **Helpers:** `getEpicsByStatus()`, `columns` array
- **API mapping:** `GET /api/projects/:projectId/epics` -- Epic interface merges app DB (id, ui_status, git_branches) with br bead data (title, description, priority, children)

### 2. `data/captures.ts`
- **Types exported:** `CaptureStatus`, `Capture`
- **Interface Capture:** id, text, userId, status, createdAt
- **Data:** 8 captures (5 pending, 2 deferred, 1 triaged)
- **Helpers:** `getCapturesByStatus()`, `getPendingCount()`
- **API mapping:** `GET /api/projects/:projectId/captures` -- Capture maps to DB captures table. Missing fields vs DB: project_id, triage_result, triaged_at, triaged_by

### 3. `data/sessions.ts`
- **Types exported:** `SessionStatus`, `AgentSession`
- **Interface AgentSession:** id, epicId, epicTitle, beadId?, beadTitle?, agentName, model, status, prompt, turns, filesModified, lastAction, duration, question?, prUrl?, prNumber?, prStatus?, startedAt, finishedAt?, queuePosition?, requestedById, tokensUsed?, contextWindowPercent?, costUsd?, subagentOf?
- **Data:** 7 sessions (2 running, 1 waiting_input, 1 queued, 2 completed, 1 failed)
- **Helpers:** `getSessionsByStatus()`, `getWaitingSessions()`
- **API mapping:** `GET /api/projects/:projectId/sessions` -- AgentSession denormalizes epic title/bead title into session object. DB stores epic_id reference. Live metrics (tokens, contextWindowPercent, costUsd) would come from Socket.IO `session:progress` events.

### 4. `data/beads.ts`
- **Types exported:** `BeadStatus`, `BeadType`, `Bead`
- **Interface Bead:** id, epicId, title, description, status, priority, type, assigneeId?, labels[], dependencies[], createdAt, updatedAt
- **Data:** 28 beads across 6 epics. Status distribution: 14 done, 4 in_progress, 2 blocked, 8 open
- **Helpers:** `getBeadsByEpicId()`, `getBeadById()`
- **API mapping:** Would come from `br show <bead_id> --json` via `BeadsService`. Not a direct API endpoint -- nested within epic detail.

### 5. `data/users.ts`
- **Types exported:** `User`
- **Interface User:** id, name, email, role, avatarUrl?, initials, color
- **Data:** 5 users (1 techlead, 1 pm, 2 dev, 1 viewer)
- **Helpers:** `getUserById()`, `currentUser` (u-1, Trung Tran, techlead)
- **Constants:** `roleLabels`, `roleColors`
- **API mapping:** `GET /api/auth/me`, `GET /api/projects/:projectId` (members)

### 6. `data/repos.ts`
- **Types exported:** `Repo`
- **Interface Repo:** id, name, gitUrl, path, defaultBranch, linkMode, status, lastCommit: {sha, message, author, time}, uncommittedCount
- **Data:** 6 repos (5 cloned, 1 symlinked)
- **API mapping:** `GET /api/projects/:projectId/repos`

### 7. `data/rules.ts`
- **Types exported:** `KnowledgeRule`
- **Interface KnowledgeRule:** id, ruleText, category, confidence, maturity, source, helpfulCount, harmfulCount, createdAt
- **Data:** 6 rules across 4 categories
- **Constants:** `categoryColors`, `maturityColors`
- **API mapping:** `GET /api/projects/:projectId/rules`

### 8. `data/graph-nodes.ts`
- **Types exported:** `GraphNodeData`, `GraphEdge`
- **Interface GraphNodeData:** id, title, status, role, priority, assignee?, type
- **Data:** 10 nodes, 10 edges forming a DAG
- **API mapping:** `GET /api/projects/:projectId/graph`

### 9. `data/agent-stream.ts`
- **Types exported:** `StreamEvent`
- **Interface StreamEvent:** id, type, content, toolName?, toolInput?, toolResult?, timestamp
- **Data:** 18 events simulating a search API implementation session
- **API mapping:** `GET /api/sessions/:sessionId/events`, Socket.IO `session:event`

### 10. `data/pr-review.ts`
- **Types exported:** `PrFile`, `SecurityWarning`, `PrComment`, `PrReview`
- **Data:** 1 PR review (PR #45, login page redesign) with 3 files, 2 security warnings, 2 comments
- **API mapping:** `GET /api/reviews/:sessionId`

### 11. `data/notifications.ts`
- **Types exported:** `Notification`
- **Interface Notification:** id, type, title, body, link, read, createdAt
- **Data:** 5 notifications (3 unread, 2 read)
- **Helpers:** `getUnreadCount()`
- **API mapping:** `GET /api/notifications`

### 12. `data/webhooks.ts`
- **Types exported:** `WebhookConfig`
- **Interface WebhookConfig:** id, type, url, events[], enabled, createdAt
- **Data:** 3 webhooks (1 Slack, 1 Discord, 1 Telegram)
- **Constants:** `availableEvents` (5 event types)
- **API mapping:** `GET /api/projects/:projectId/webhooks`
