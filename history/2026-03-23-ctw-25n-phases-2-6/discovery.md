# Discovery Report — Phases 2-6

## Current State (Phase 1 Complete)

### What's Built
- **Monorepo**: pnpm workspace, @ctw/server + @ctw/client
- **Database**: 13 tables via Drizzle ORM, SQLite WAL mode, auto-migration, admin seed
- **API**: 7 route files (auth, projects, captures, epics, sessions, notifications, health) with JWT+API key auth, RBAC
- **Services**: 8 wrappers (BeadsService, BvService, CassService, GitService, AgentMailClient, CmClient, AgentManager, WebhookService) — all defined but **not wired to routes**
- **Socket.IO**: Auth middleware, room structure, emit helpers — event types defined but **never emitted from routes**
- **Frontend**: React 19 SPA with lazy-loaded pages, Tailwind 4, shadcn/ui base components — **all pages are placeholders**
- **Tests**: 100 tests passing across 17 files

### Critical Integration Gaps
1. **Services not called from routes** — AgentManager, BeadsService, GitService etc. exist as standalone classes but no route invokes them
2. **Socket.IO events never emitted** — emitToProject/Session/User helpers defined but zero calls in route handlers
3. **Frontend API paths may mismatch** — client lib/api.ts patterns need verification against actual server routes
4. **No execution engine** — sessions route creates DB records but doesn't spawn agents

## Phase-by-Phase Requirements

### Phase 2: Capture + Triage + Epic Dashboard
- **UI**: Capture inbox sidebar, Epic Kanban board (5 columns, dnd-kit), Epic side panel, filter/sort
- **Backend**: Wire captures/epics routes to emit Socket.IO events, integrate BeadsService for br CRUD
- **New components**: CaptureInbox, EpicCard, EpicSidePanel, BoardColumn
- **Risk**: LOW — standard CRUD + drag-drop, patterns exist in codebase

### Phase 3: Execution Engine
- **Core**: 12-step agent spawn flow (scope gate → git branch → Agent Mail register → CM context → CASS search → spawn → stream → Q&A → complete)
- **New services**: ContextBuilder (6-source assembly), AgentQueue, QuestionHandler (3 modes)
- **Backend**: Wire AgentManager to sessions route, implement queue management, NDJSON streaming to Socket.IO
- **UI**: AgentStreamView (terminal-like), AskUserQuestionDialog, AlertBar
- **Risk**: HIGH — complex process management, stdin/stdout piping, crash recovery

### Phase 4: Quality Gate
- **Core**: Pre-push validation (tests, build, typecheck, forbidden patterns), PR creation via gh, Code Review Agent auto-spawn, feedback loop
- **New services**: ValidationService, PrService, ReviewAgentSpawner
- **UI**: DiffViewer (react-diff-viewer-continued), AI review summary, comment thread
- **Risk**: MEDIUM — gh CLI integration well-documented, but multi-repo merge coordination is complex

### Phase 5: Shared Memory + Notifications
- **Core**: CM rules management UI, Agent Mail thread viewer, CASS session indexing, webhook dispatch, in-app + browser push notifications
- **New routes**: rules, mail, webhooks (proxy to Docker services)
- **UI**: Rules management table, notification bell, webhook config forms
- **Risk**: LOW-MEDIUM — mostly CRUD UIs + HTTP proxying to Docker services

### Phase 6: Graph + Deployment
- **Core**: bv dependency graph (React Flow + dagre), Cloudflare Tunnel, PM2 config
- **UI**: GraphView with node coloring (ready/blocked/critical path), legend, filters
- **Infra**: cloudflared config, ecosystem.config.cjs, Cloudflare Access JWT verification
- **Risk**: LOW — bv provides JSON output, React Flow handles rendering; deployment is manual config

## Dependency Chain
```
Phase 2 (Dashboard) → Phase 3 (Execution) → Phase 4 (Quality Gate) → Phase 5 (Memory/Notifications)
                                                                        ↕ (parallel)
                                                                      Phase 6 (Graph/Deploy)
```

## External Dependencies
- **Phase 2**: br CLI only
- **Phase 3**: br, claude CLI, git, Agent Mail (Docker), CM (Docker), cass
- **Phase 4**: gh CLI, git
- **Phase 5**: Agent Mail (Docker), CM (Docker), cass, Slack/Discord webhooks
- **Phase 6**: bv CLI, cloudflared, PM2

## Patterns to Follow
- Routes: Express Router per resource, zod validation, authenticate + requireRole middleware
- Services: execFile for CLI, fetch for HTTP clients, class-based with constructor injection
- Frontend: TanStack Query for server state, Zustand for UI state, Socket.IO invalidates query keys
- Naming: kebab-case files, PascalCase components, camelCase vars, snake_case DB
- Vietnamese: full diacritical marks on all user-facing strings
