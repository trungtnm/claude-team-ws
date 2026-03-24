# UI Spec Summary

---

## Stats

| Category | Count |
|----------|-------|
| Pages | 7 |
| Domain components | 27 |
| Layout components | 4 |
| shadcn/ui primitives | 13 |
| Stores (Zustand) | 4 |
| Mock data files | 12 |
| Spec files | 9 |
| **Total source files** | **67** |

---

## Stack Profile

| Concern | Demo | Production Target |
|---------|------|-------------------|
| Server state | Static mock imports | TanStack Query v5 |
| Real-time | Not connected | Socket.IO client |
| Auth | Hardcoded `currentUser` | JWT + API key via `GET /api/auth/me` |
| Routing | Flat (`/board`, `/agents`) | Project-scoped (`/projects/:id/board`) |
| Data fetching | Direct imports from `data/` | `fetch()` to Express API on `:3000` |
| Drag-and-drop | `@dnd-kit` imported but NOT wired | `@dnd-kit` cross-column epic DnD |

---

## Gaps Found

### Missing from Demo vs API Spec

| Gap | Demo Status | API Endpoint | Priority |
|-----|-------------|-------------|----------|
| Authentication flow | Hardcoded user, no login | `POST /api/auth/login`, `GET /api/auth/me` | P0 |
| Project scoping | Single hardcoded project | `GET /api/projects`, route params | P0 |
| TanStack Query integration | All data static | Every API endpoint | P0 |
| Socket.IO client | Not present | All real-time events | P1 |
| Drag-and-drop on board | `@dnd-kit` imported but unused | `PATCH /api/.../epics/:id` | P1 |
| Session creation flow | Toast "not available in demo" | `POST /api/.../sessions` | P1 |
| Activity/feed page | No page exists | `GET /api/.../activity_log` (implied) | P2 |
| Agent Mail thread viewer | Listed in epics as a feature | `GET /api/.../mail/threads` | P2 |
| Beads sync status | Not shown | `GET /api/.../beads-sync/status` | P2 |
| Search (Cmd+K) | Not implemented | `GET /api/search` (planned) | P3 |

### Data Shape Mismatches (Demo vs DB Schema)

| Entity | Demo Field | DB/API Difference |
|--------|-----------|-------------------|
| `Capture` | `userId: string` | DB has `user_id`, `project_id`, `triage_result` JSON, `triaged_at`, `triaged_by` |
| `Epic` | Flat object with all fields | Production merges `epics` table + `br show` JSON. `sourceCaptures` not in DB -- would need join or separate fetch |
| `AgentSession` | `epicTitle`, `beadTitle` denormalized | DB stores `epic_id` FK only. Titles resolved via join/lookup |
| `AgentSession` | `tokensUsed`, `contextWindowPercent`, `costUsd` | Not in DB schema -- ephemeral data from live socket events |
| `User` | `initials`, `color` | Not in DB. Compute `initials` from `name`. `color` is UI-only, deterministic from user ID |
| `Bead` | `epicId` field | Beads are owned by `br` CLI. Relationship is via `br dep` (parent-child). Epic ID lives in app DB's `epics.bead_epic_id` |
| `Notification` | `link: string` (relative path) | DB schema matches, but `link` in DB is described as deep link |
| `WebhookConfig` | `type: 'slack' | 'discord' | 'telegram'` | DB schema has `type: 'slack' | 'discord'` only (no telegram) |

### Missing Socket.IO Events Not Demoed

| Event | Room | What It Does |
|-------|------|-------------|
| `session:event` | `session:<id>` | Live NDJSON stream -- demo shows static events |
| `session:progress` | `session:<id>` | Periodic metrics update (turns, files, elapsed) |
| `session:question` | `session:<id>` | AskUserQuestion push |
| `session:question:answered` | `session:<id>` | Dismiss alert bar |
| `capture:created` | `project:<id>` | Real-time capture from other users |
| `epic:created` / `epic:updated` | `project:<id>` | Board card updates |
| `pr:event` | `project:<id>` | PR lifecycle updates |
| `queue:updated` | `project:<id>` | Agent queue position changes |
| `beads:changed` | `project:<id>` | Trigger refetch of board/graph |
| `notification` | `user:<id>` | Push notification to bell dropdown |

### Ambiguities

1. **Capture → Epic triage flow:** The demo simulates an AI-powered triage with fake processing steps and questions. The API spec describes `POST .../epics/:epicId/analyze-scope` and `POST .../epics/:epicId/confirm-split`, but the triage dialog in the demo goes from captures directly to epic+beads creation, which is a slightly different flow. Clarify whether triage creates the epic or if captures are attached to an existing epic.

2. **EpicDetailSheet vs Sheet:** Named "Sheet" but implemented as a full-width `Dialog` (max-w-5xl). The `components/ui/sheet.tsx` exists but is not used by this component. The side-panel behavior from the wireframe is implemented as a dialog instead.

3. **CaptureInbox sidebar:** The wireframe shows a persistent sidebar capture inbox. The demo has `CaptureInbox` as a component but it's not rendered in the current layout -- replaced by the `/captures` dedicated page and header CTA. The `useAppStore.captureInboxOpen` state exists but is unused.

4. **CaptureFab vs Header CTA:** `capture-fab.tsx` exists with `Cmd+J` shortcut but is NOT rendered. Header also registers `Cmd+J`. In production, only one should register the shortcut.

5. **Subagent support:** `AgentSession` has a `subagentOf?: string` field but no UI uses it. This suggests future support for parent/child agent relationships.

---

## Recommended Implementation Order

### Phase 1: Foundation (P0)
1. **Auth + login page** -- `POST /api/auth/login`, session management, route guards
2. **Project scoping** -- Nested routes under `/projects/:projectId/`, project context provider
3. **TanStack Query setup** -- Query client, query keys, API client wrapper
4. **Socket.IO client** -- Connection manager with auth, room join/leave, reconnection

### Phase 2: Core Pages (P0-P1)
5. **Board page** -- Epic CRUD with real data, drag-and-drop wiring
6. **Captures page** -- Capture CRUD, real triage flow
7. **Agents page** -- Session list with live data, session creation dialog
8. **Agent stream** -- Live NDJSON streaming via Socket.IO, event replay
9. **Notifications** -- Socket.IO push, mark-as-read API, notification preferences (ships with the header component)

> **Note:** Settings project tab (agent configuration) is a Phase 2 dependency for the agents page. The agents page needs `max_concurrent_agents` and `ask_question_mode` settings to be readable from the API.

### Phase 3: Quality Gate (P1)
10. **PR Review page** -- Real diff from GitHub API, comment posting, merge flow
11. **Graph page** -- Real data from `bv --robot-insights`, live updates

### Phase 4: Settings & Polish (P1-P2)
12. **Settings - Project** -- Real config save, integration health checks
13. **Settings - Repos** -- Real git operations (clone, pull, branch)
14. **Settings - Users** -- Invite flow, role management
15. **Settings - Rules** -- CM integration, rule CRUD
16. **Settings - Webhooks** -- Webhook CRUD, test delivery

### Phase 5: Advanced (P2-P3)
17. **Beads sync status** -- Conflict banner, resume/force sync
18. **Activity feed page** -- Activity log timeline
19. **Agent Mail viewer** -- Thread browsing, file reservations
20. **Search (Cmd+K)** -- Global search with CASS

---

## Parallelization Constraints

Shared infrastructure (Phase 1) **must complete before** page-level agents start work. Specifically:

- `01-shared-infrastructure.md` defines TanStack Query key conventions, Socket.IO client singleton, API client wrapper, and auth context that every page depends on.
- Page agents (board, captures, agents, settings, PR review, graph) can work **in parallel** once shared infrastructure is merged.
- Within a page, component work can be parallelized (e.g., `EpicCard` and `FilterBar` can be built concurrently).
- Cross-page dependencies: Agents page depends on Settings project tab for agent config values (`max_concurrent_agents`, `ask_question_mode`).

---

## Layout Gaps

| Gap | Detail | Priority |
|-----|--------|----------|
| `beads:sync_conflict` banner | Red persistent banner across project when `beads:sync_conflict` Socket.IO event is received. Dismisses only on `beads:sync_resolved`. Similar to `AgentAlertBar` but red/error themed. See `04-socket-io-events.md`. | P1 |

---

## File Index

### Spec Files
| File | Content |
|------|---------|
| `docs/ui-specs/00-inventory.md` | Full catalog of pages, components, stores, data files |
| `docs/ui-specs/01-shared-infrastructure.md` | TanStack Query keys, Socket.IO client setup, API client, auth context |
| `docs/ui-specs/layout-and-shared.md` | App shell, header, alert bar, composer, router, design tokens, shadcn/ui |
| `docs/ui-specs/board-page.md` | Epic Kanban board with columns, cards, detail sheet, bead list |
| `docs/ui-specs/captures-page.md` | Capture inbox, triage dialog, AI-powered epic creation |
| `docs/ui-specs/agents-page.md` | Agent mission control, session list, stream view, question dialog |
| `docs/ui-specs/graph-page.md` | Dependency graph visualization with bv integration |
| `docs/ui-specs/settings-page.md` | Project settings: repos, users, rules, webhooks |
| `docs/ui-specs/pr-review-page.md` | PR review: diff viewer, AI summary, comment thread, merge actions |
| `docs/ui-specs/99-summary.md` | Stats, gaps, implementation order (this file) |

### Source Files by Domain

**Entry:**
`src/main.tsx`, `src/app.tsx`, `src/index.css`, `src/lib/utils.ts`

**Layout:**
`src/components/layout/layout.tsx`, `src/components/layout/header.tsx`, `src/components/layout/agent-alert-bar.tsx`, `src/components/layout/notification-dropdown.tsx`

**Pages:**
`src/pages/board-page.tsx`, `src/pages/captures-page.tsx`, `src/pages/agents-page.tsx`, `src/pages/agent-stream-page.tsx`, `src/pages/graph-page.tsx`, `src/pages/settings-page.tsx`, `src/pages/pr-review-page.tsx`

**Board:**
`src/components/board/board-column.tsx`, `src/components/board/epic-card.tsx`, `src/components/board/epic-detail-sheet.tsx`, `src/components/board/epic-create-dialog.tsx`, `src/components/board/filter-bar.tsx`, `src/components/board/priority-badge.tsx`, `src/components/board/bead-list.tsx`, `src/components/board/bead-detail-dialog.tsx`

**Agents:**
`src/components/agents/agent-stream-view.tsx`, `src/components/agents/stream-event.tsx`, `src/components/agents/session-stats-bar.tsx`, `src/components/agents/ask-question-dialog.tsx`, `src/components/agents/session-card.tsx`

**Graph:**
`src/components/graph/dependency-graph.tsx`, `src/components/graph/graph-node.tsx`, `src/components/graph/graph-legend.tsx`, `src/components/graph/graph-controls.tsx`

**PR Review:**
`src/components/pr-review/pr-review-layout.tsx`, `src/components/pr-review/file-tree.tsx`, `src/components/pr-review/diff-viewer.tsx`, `src/components/pr-review/ai-review-summary.tsx`, `src/components/pr-review/comment-thread.tsx`

**Capture:**
`src/components/capture/capture-composer.tsx`, `src/components/capture/capture-card.tsx`, `src/components/capture/capture-inbox.tsx`, `src/components/capture/capture-fab.tsx`, `src/components/capture/triage-dialog.tsx`

**Settings:**
`src/components/settings/project-tab.tsx`, `src/components/settings/repos-tab.tsx`, `src/components/settings/add-repo-dialog.tsx`, `src/components/settings/users-tab.tsx`, `src/components/settings/rules-tab.tsx`, `src/components/settings/webhooks-tab.tsx`

**Stores:**
`src/stores/board-store.ts`, `src/stores/agent-store.ts`, `src/stores/capture-store.ts`, `src/stores/app-store.ts`

**Data:**
`src/data/epics.ts`, `src/data/captures.ts`, `src/data/sessions.ts`, `src/data/beads.ts`, `src/data/users.ts`, `src/data/repos.ts`, `src/data/rules.ts`, `src/data/graph-nodes.ts`, `src/data/agent-stream.ts`, `src/data/pr-review.ts`, `src/data/notifications.ts`, `src/data/webhooks.ts`

**UI Primitives:**
`src/components/ui/button.tsx`, `src/components/ui/badge.tsx`, `src/components/ui/card.tsx`, `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`, `src/components/ui/tabs.tsx`, `src/components/ui/scroll-area.tsx`, `src/components/ui/separator.tsx`, `src/components/ui/tooltip.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/components/ui/select.tsx`
