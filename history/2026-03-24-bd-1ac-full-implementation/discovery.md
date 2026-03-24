# Discovery Report — Full Implementation of claude-team-ws

**Date:** 2026-03-24
**Scope:** Implement ALL specs from docs/ as production-ready application

---

## 1. Current State (Post-Reset)

### What Exists on Disk
```
claude-team-ws/
├── docs/               # 13+ architecture specs (COMPLETE)
├── ui/                 # 75-file React demo (ALL 7 pages, 40+ components, mock data only)
├── playgrounds/agents/ # Working Agent SDK reference (Express + Socket.IO + real sessions)
├── .beads/             # Issue tracker initialized (prefix: ctw)
├── .ccu/               # Session state
├── docker/             # NOT YET CREATED
├── package.json        # Minimal (docker scripts only, no pnpm workspace)
├── tsconfig.base.json  # ES2022 target, strict mode
├── .env.example        # Port, JWT, DB, Agent Mail, CM URLs
├── CLAUDE.md           # Project conventions
└── README.md           # Full architecture overview
```

### What Was Deleted (commit f365814)
- `packages/server/` — Full Express API (14-table Drizzle schema, 6 routes, 9 services, 2 middleware, 20 tests)
- `packages/client/` — React SPA wired to backend (TanStack Query, Socket.IO, all pages)
- `pnpm-workspace.yaml` — Monorepo config
- Root package.json scripts (dev, build, test, etc.)

### What Needs Rebuilding
Everything in `packages/` must be recreated. Git history at `b1abceb` has the prior implementation as reference.

---

## 2. Architecture Specifications (from docs/)

### Database Schema (01-database-schema.md)
14 tables in App SQLite (workspace.db):
- **users** — id, name, email, role (pm/dev/techlead/viewer), api_key, avatar_url
- **projects** — id, name, slug, project_root, max_concurrent_agents, ask_question_mode
- **repos** — id, project_id, name, git_url, path, default_branch, link_mode, status
- **project_members** — (project_id, user_id) PK, role_override
- **captures** — id, project_id, user_id, text, status, triage_result (JSON)
- **epics** — id, project_id, bead_epic_id, git_branches (JSON), ui_status, scope_analysis, split_proposal
- **sessions** — id, project_id, epic_id, user_id, claude_session_id, model, status, prompt, pid, pr_url, pr_status
- **session_events** — id (autoincrement), session_id, event_type, data (JSON)
- **agent_queue** — id, project_id, epic_id, user_id, priority, prompt, model, status, position
- **knowledge_rules** — id, project_id, rule_text, category, confidence, maturity, source
- **webhook_configs** — id, project_id, type (slack/discord), url, events (JSON), enabled
- **notifications** — id, user_id, project_id, type, title, body, link, read
- **activity_log** — id (autoincrement), project_id, user_id, action, details (JSON)

Beads SQLite managed exclusively by br CLI — never query directly.

### API Endpoints (02-api-specification.md)
~40+ endpoints across 11 route groups:
- Auth: login, me, logout
- Projects: CRUD + settings
- Repos: CRUD + pull + branches
- Captures: CRUD + triage
- Epics: CRUD + analyze-scope + confirm-split
- Sessions: CRUD + cancel + resume + answer + events
- Reviews: list + detail + comment + merge
- Graph: data + triage + plan
- Rules: CRUD
- Mail: threads proxy
- Webhooks: CRUD
- Notifications: list + mark-read
- Beads Sync: status + resume + force
- Health: liveness check

### Socket.IO Events (04-socket-io-events.md)
3 room types, 20+ event types:
- Project room: capture/epic/session lifecycle, PR, queue, beads sync
- Session room: NDJSON stream, questions, progress
- User room: notifications

### Agent Lifecycle (06-agent-lifecycle.md)
12-phase flow: Trigger → Scope Gate → Git Branch → Context Build → Spawn → Stream → AskUserQuestion → Completion → Validation → Push + PR → Review → Merge

### Dependencies (07-dependencies.md)
Server: Express 5, Socket.IO 4, Drizzle 0.38, better-sqlite3 11, Zod 3.24, JWT 9, Agent SDK
Client: React 19, Vite 6, Tailwind 4, TanStack Query 5, Zustand 5, Socket.IO client 4, React Flow 12, dnd-kit

---

## 3. Reference Implementations

### ui/ Demo (75 files)
- ALL 7 pages fully rendered with mock data
- 40+ domain components (board, capture, agents, graph, pr-review, settings)
- 13 shadcn/ui primitives styled with "Warm Workshop" dark theme
- 4 Zustand stores (UI state only)
- 12 mock data files with realistic domain models
- NO API calls, NO Socket.IO, NO TanStack Query

### playgrounds/agents/ (Working Agent SDK)
- Express server with Socket.IO on port 3001
- SessionManager class using @anthropic-ai/claude-agent-sdk query()
- canUseTool callback with permission mode handling
- AskUserQuestion via promise-based resolution
- NDJSON stream parsing → Socket.IO broadcast
- Context window tracking from usage metadata
- Session resume via sessionId
- React frontend with TanStack Query + Socket.IO hooks
- File attachment handling

---

## 4. Known Gaps & Decisions Needed

| Gap | Impact | Decision |
|-----|--------|----------|
| acceptanceCriteria storage | Board page needs it | Store in bead description (br manages) |
| Telegram webhook in UI but not DB | Settings page | Remove Telegram, keep slack/discord per schema |
| PR review route uses :prNumber but API uses :sessionId | Route mismatch | Use :sessionId in route, lookup PR from session |
| context_window_percent not in session:progress event | Agents page gauge | Add to session:progress payload from Agent SDK usage data |
| File upload for capture attachments | Composer supports it | Define upload endpoint or defer to Phase 2 |
| User management API | Settings users tab | Implement CRUD for project_members |
| Project scoping in client routes | All pages | Nest under /projects/:projectId/* |
| docker/ directory missing | Infrastructure | Create docker-compose.yml per spec |

---

## 5. Existing Patterns to Follow

### From ui/ Demo
- Lazy-loaded pages with React.lazy() + Suspense
- shadcn/ui component patterns (Dialog, Sheet, Tabs, etc.)
- Warm Workshop dark theme (CSS custom properties in index.css)
- Zustand for UI-only state, never server data
- cn() utility for conditional Tailwind classes

### From playgrounds/agents/
- Agent SDK query() with AbortController
- canUseTool callback returning { behavior, updatedInput }
- Socket.IO rooms per session
- TanStack Query with socket-driven invalidation
- Stream event rendering (system/assistant/tool_use/tool_result/error)

### From Previous Server (git history)
- Drizzle ORM schema with proper SQLite pragmas
- Zod validation on all route inputs
- Dual auth: API key (Bearer) + JWT cookie
- RBAC middleware with role checking
- Service classes wrapping CLI tools via execFile
- Test infrastructure: createTestDb(), cleanAllTables(), seedTestUser()

---

## 6. Scale Estimate

| Component | Estimated Files | Estimated Lines |
|-----------|----------------|-----------------|
| Server (routes, services, middleware, schema, tests) | ~35 files | ~5,000 lines |
| Client (pages, components, hooks, stores, api) | ~70 files | ~8,000 lines |
| Infrastructure (docker, configs, migrations) | ~10 files | ~500 lines |
| Root (workspace config, scripts) | ~5 files | ~100 lines |
| **Total** | **~120 files** | **~13,600 lines** |
