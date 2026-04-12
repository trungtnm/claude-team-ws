---
version: 1
date: "2026-04-13"
head: "f047f2736e4b44374ee89a5243ebcdc45afad29e"
timestamp: "2026-04-13T00:00:00Z"
docs_hash: "a1dc5adbdbf1a04149543e588ba6a563b83684433bf913171a78d426f21dbee0"
---

# Cached Prime Synthesis

## Project Overview

**claude-team-ws** is a semi-auto, epic-driven dev workspace — a web app for dev teams to manage Epics, spawn Claude Code agents, and review PRs. The current branch is `demo-to-prod`, actively reimplementing the production app from a working demo prototype.

**Core workflow:**
1. PM/Dev capture ideas → Capture Inbox (`/captures`)
2. AI triage → converts to Epics (with Beads breakdown)
3. Dev triggers Agent Session on an Epic → Claude Code spawned via Agent SDK
4. Agent streams NDJSON events live → PR auto-created on completion
5. AI peer review + human review → squash merge into main

**Current state:** Production implementation is substantially complete. Recent work includes session token tracking, API key hashing, worktree/workflow features, and agent stream UX. There are uncommitted changes related to a worktree + workflow feature.

## Technical Architecture

### Stack
- **Frontend**: Vite 6 + React 19 + Tailwind CSS 4 + shadcn/ui + Zustand 5 + TanStack Query 5 (port 5173)
- **Backend**: Express 5 + Socket.IO 4 + Drizzle ORM + SQLite better-sqlite3 (port 3000)
- **Agent Engine**: `@anthropic-ai/claude-agent-sdk` `query()` with AbortController
- **Infrastructure**: Docker Compose (Agent Mail :8765 + CM Memory :9900) + PM2 + Cloudflare Tunnel

### Key Services (packages/server/src/services/)
- `session-runner.ts` — core engine: spawns Claude via Agent SDK, streams NDJSON, handles AskUserQuestion, enforces concurrency limits, tracks token usage
- `git-service.ts` — git branch checkout, worktree creation, push/merge
- `session-cleanup.ts` — idle session reaping (sessions idle >1 day)
- `workflow-executor.ts` (new, uncommitted) — multi-step workflow orchestration
- `workflow-types.ts` (new, uncommitted) — workflow node type definitions
- `socket-manager.ts` — Socket.IO rooms: `project:<id>`, `session:<id>`, `user:<id>`
- `beads-service.ts` — br CLI wrapper (read/write issue tracker)
- `bv-service.ts` — bv CLI wrapper (graph analysis, triage)
- `gh-service.ts` — gh CLI wrapper (PR creation/management)
- `webhook-dispatcher.ts` — Slack/Discord/Telegram webhooks
- `r2-service.ts` — Cloudflare R2 for file storage

### Database Schema (packages/server/src/db/schema.ts)
15+ tables in workspace.db:
- `users`, `projects`, `project_members`, `repos` — auth/RBAC/multi-repo
- `captures` — idea inbox with attachment support (base64 JSON)
- `epics` — kanban items (blocked→ready→in_progress→in_review→done)
- `sessions` — agent lifecycle (queued→running→waiting_input→idle→completed/failed)
  - Has worktree_path, worktree_branch, workflow_nodes (new), token counters
- `session_events` — NDJSON event log (system/assistant/tool_use/tool_result/result/error)
- `agent_queue` — concurrency queue with position ordering
- `knowledge_rules` — CM rules cache (confidence, maturity, helpful/harmful counts)
- `webhook_configs`, `notifications`, `activity_log`, `session_audit_log`

### API Routes (packages/server/src/routes/)
- `sessions.ts` — full CRUD + start/stop/resume/interrupt + message sending
- `epics.ts`, `captures.ts`, `projects.ts`, `repos.ts`
- `rules.ts` — knowledge rules CRUD
- `members.ts`, `reviews.ts`, `webhooks.ts`, `notifications.ts`
- `beads-sync.ts` — br sync trigger
- `graph.ts` — bv graph data
- `mail.ts` — Agent Mail MCP proxy
- `activity.ts`, `health.ts`

### Frontend Structure (packages/client/src/)
**Pages**: board, captures, agents (stream view), graph, settings, pr-review, activity, login
**Components by domain**: agents/, board/, capture/, graph/, layout/, pr-review/, settings/, ui/
**State**:
- TanStack Query for ALL server state
- Zustand for UI state only (agent-store, app-store, board-store, capture-store)
- Socket.IO events invalidate TanStack Query keys for real-time updates

## Conventions and Patterns

### Critical Rules
1. **No stubs/mocks in production** — complete implementations only; use Agent Mail to coordinate dependencies
2. **execFile not exec** — all CLI calls via `child_process.execFile` (prevents shell injection)
3. **Beads.db never directly** — ONLY access via `br` CLI; never query `.beads/beads.db`
4. **After every br mutation**: `br sync --flush-only`
5. **canUseTool must include updatedInput** — `{ behavior: 'allow', updatedInput: input }`
6. **Zod validation on all routes** — `.safeParse()`, return 400 with issues on failure
7. **Socket.IO emit on every mutation** — `emitToProject()`, `emitToSession()`, `emitToUser()`
8. **Timestamps as INTEGER unix epoch** — `DEFAULT (unixepoch())`

### Code Conventions
- Files: `kebab-case.ts/tsx`, Components: `PascalCase`, DB: `snake_case`, API: `kebab-case`
- Strict TypeScript, ES modules, no `any`
- Tests: Unit (vi.mock deps), Integration (real SQLite via createTestDb()), E2E (Playwright)
- Language: UI strings in English; docs/comments may be Vietnamese with diacritics

### Tailwind v4 Note
Some utilities silently fail (right-4, top-4 etc.) — use inline styles for critical positioning.

## Active Work

### Uncommitted Changes on demo-to-prod branch
**New files (not yet committed):**
- `packages/server/src/services/workflow-executor.ts` — workflow orchestration engine
- `packages/server/src/services/workflow-types.ts` — workflow node type definitions
- `packages/server/drizzle/migrations/0008_add_worktree_and_workflow.sql` — DB migration
- `packages/client/src/components/agents/step-tree-sidebar.tsx` — UI for workflow step tree
- `packages/server/mobile/` — mobile-related server files (unclear scope)
- `history/2026-04-10-ctw-opk-worktree-workflow/` — planning artifacts

**Modified files:**
- Schema: worktree/workflow fields added to sessions table
- `session-runner.ts`, `git-service.ts`, `session-cleanup.ts` — worktree integration
- `sessions.ts` route — new worktree/workflow endpoints likely
- Client: `agent-stream-view.tsx`, `stream-event.tsx`, `agents-page.tsx` — stream UX improvements
- `settings/project-tab.tsx` — project settings additions
- `hooks/use-sessions.ts`, `use-settings.ts`, `types/index.ts` — type updates

**Beads:** No open in-progress beads currently. The board is clear.

### Recently Completed (last 10 commits)
- Session token counter columns added
- API key SHA-256 hashing + scoped rate limiter
- claude-config feature removed (was a dead end)
- QA sweep fixes on agents page UX
- Permission bar moved to composer
- Capture attachment image preview
- Activity page date/user bug fixes
- Shareable session deep links via URL sync

## Codebase Map

```
claude-team-ws/
├── packages/
│   ├── client/src/
│   │   ├── pages/          # 9 pages (board, captures, agents, graph, settings, pr-review, activity, login, agent-stream)
│   │   ├── components/     # domain components + shadcn/ui primitives
│   │   ├── hooks/          # TanStack Query hooks (14 hooks)
│   │   ├── stores/         # Zustand (4 stores: agent, app, board, capture)
│   │   ├── types/index.ts  # shared TypeScript types
│   │   └── data/           # mock/seed data (not used in production)
│   └── server/src/
│       ├── routes/         # 15 Express routers
│       ├── services/       # 9 service classes + workflow (new)
│       ├── db/             # Drizzle schema, migrations, test-db
│       └── middleware/     # auth, rbac, rate-limit
├── docs/                   # Architecture specs (00-09 + ui-specs/)
├── .beads/                 # Issue tracker (br), prefix: ctw
├── .ccu/                   # Session staging (captures, evidence, decisions)
├── history/                # Planning artifacts per epic
└── docker/                 # Docker Compose for Agent Mail + CM
```
