# CLAUDE.md — claude-team-ws

## GOLDEN RULE: No Stubs, No Mocks in Production Code

**Every piece of delivered work MUST be complete and functional.** Do NOT write stubs, placeholder implementations, mocked return values, TODO markers, or "will be implemented later" code in the final codebase. If a dependency is not yet available (e.g., a backend API a frontend component needs, or a service another agent is building), you MUST:

1. **Communicate via Agent Mail** — send a message to the responsible agent asking for the dependency, specifying what you need (endpoint, interface, data shape).
2. **Wait for the dependency to be resolved** — do NOT invent your own stub/mock to unblock yourself. Block your bead and move to other ready work instead.
3. **Only proceed when the real implementation exists** — integrate against the actual code, not a fake.

**The only exceptions:**
- Test files (`*.test.ts`, `*.integration.test.ts`, `*.spec.ts`) — mocks and test doubles are expected and required
- UI demo directory — prototypes and visual demos may use placeholder data
- The user explicitly asks for a stub or placeholder

**Why:** Stubs accumulate as tech debt, create false confidence (tests pass against mocks but fail against reality), and cause integration failures when agents assume stubs are real. Complete work or no work.

## The Project

Semi-Auto Epic-Driven Dev Workspace. Web app for dev team to manage Epics, spawn Claude Code agents, review PRs.

## Stack

- **Frontend**: Vite 6 + React 19 + Tailwind CSS 4 + shadcn/ui + Zustand 5 + TanStack Query 5
- **Backend**: Express 5 + Socket.IO 4 + Drizzle ORM + SQLite (better-sqlite3)
- **Infrastructure**: Docker Compose (Agent Mail + CM) + PM2 + Cloudflare Tunnel
- **CLI integrations**: claude, br, bv, cass, gh, git (all via `execFile`, never `exec`)

## Monorepo Structure

```
packages/client/    — Vite React SPA (port 5173)
packages/server/    — Express API server (port 3000)
docker/             — Docker Compose for Agent Mail + CM
docs/               — Architecture specs (00-09)
history/            — Planning artifacts per epic
.beads/             — Issue tracker (br), prefix: ctw
```

## Commands

```bash
pnpm dev              # Start both client + server concurrently
pnpm build            # Production build (server then client)
pnpm test             # Unit tests (vitest, excludes integration)
pnpm test:integration # Integration tests (real SQLite, supertest)
pnpm test:e2e         # E2E tests (Playwright, chromium)
pnpm db:generate      # Generate Drizzle migration from schema changes
pnpm db:migrate       # Apply pending migrations
pnpm docker:up        # Start Agent Mail + CM containers
pnpm docker:down      # Stop containers
```

## Environment Setup

```bash
pnpm install                    # Install all dependencies
cp .env.example .env            # Copy and edit env vars
pnpm db:migrate                 # Initialize SQLite database
pnpm docker:up                  # Start Agent Mail + CM (optional, for multi-agent)
pnpm dev                        # Start client (5173) + server (3000)
```

Required env vars (see `.env.example`):
- `JWT_SECRET` — auth token signing (change from default)
- `ADMIN_API_KEY` — admin bootstrap key
- `DATABASE_PATH` — SQLite path (default: `./data/workspace.db`)
- `AGENT_MAIL_URL` / `MCP_AGENT_MAIL_TOKEN` — only if using multi-agent coordination

## Code Conventions

### TypeScript
- Strict mode, ES modules (`"type": "module"`)
- Use `zod` for all API request validation — no manual `req.body` parsing
- Return types explicit on exported functions
- Prefer `import type` for type-only imports
- No `any` — use `unknown` and narrow

### API Routes
- Express Router per resource in `routes/` — one file per domain (captures, epics, sessions, etc.)
- Every mutation MUST emit Socket.IO events to the relevant room via `emitToProject()`, `emitToSession()`, or `emitToUser()`
- Use `authenticate` middleware on all routes except `/api/health`
- Use `requireRole('pm', 'techlead')` for write operations per role permissions table
- Request validation with zod `.safeParse()` — return 400 with `parsed.error.issues` on failure
- CLI wrappers in `services/` use `execFile` (never `exec`) to prevent shell injection
- Error responses: `{ error: "message" }` with proper HTTP status codes

### Services
- One class per external tool/service in `services/`
- CLI tools (br, bv, cass, git, gh): wrap via `child_process.execFile` with `promisify`
- Docker services (Agent Mail, CM): wrap via `fetch` HTTP client
- Long-running processes (claude CLI): use `@anthropic-ai/claude-agent-sdk` query() with AbortController
- All service errors must include context: `throw new Error(\`BeadsService.show failed for ${beadId}: ${err.message}\`)`

### Agent SDK (Programmatic Claude Code)
- Use `@anthropic-ai/claude-agent-sdk` for running Claude Code sessions programmatically — never raw CLI spawn
- Reference implementation: `playgrounds/agents/` (working playground with real sessions)
- `canUseTool` callback return MUST include `updatedInput` field — `{ behavior: 'allow', updatedInput: input }`
- AskUserQuestion: hold `canUseTool` promise, resolve with `{ behavior: 'allow', updatedInput: { ...input, answers: { q: answer } } }`
- Session resume: pass `resume: sessionId` in options (UUID from system.init event)
- Context window data: extract from `assistant.message.usage` (input_tokens + cache_creation + cache_read)

### Frontend
- Pages in `pages/`, components in `components/{domain}/`, shared in `components/ui/`
- TanStack Query for ALL server state — no `useState` + `fetch` patterns
- Zustand only for UI state (sidebar, filters, selections) — never for server data
- Socket.IO events should invalidate TanStack Query keys for real-time updates
- Lazy-load pages with `React.lazy()` + `Suspense`
- Use `@/` import alias (configured in tsconfig + vite)

### Database
- Drizzle ORM for all queries to App SQLite (`workspace.db`)
- SQLite pragmas: WAL mode, 64MB cache, foreign_keys ON, synchronous NORMAL
- Beads Rust (`br`) is source of truth for issues — **NEVER** query `.beads/beads.db` directly
- After every `br` mutation: `br sync --flush-only`
- Timestamps: INTEGER (unix epoch seconds) with `DEFAULT (unixepoch())`
- JSON fields (git_branches, scope_analysis): stored as TEXT, parse in app code

### Naming
- Files: `kebab-case.ts` / `kebab-case.tsx`
- Components: `PascalCase` (`EpicCard`, `AgentStreamView`)
- Variables/functions: `camelCase`
- DB columns: `snake_case`
- API routes: `kebab-case` paths (`/api/projects/:id/agent-queue`)
- Bead IDs: prefix `ctw-` (e.g., `ctw-2g4`)

### Error Handling
- Routes: try/catch with error messages and proper HTTP status
- Services: rethrow with context (service name + operation + original error)
- Frontend: TanStack Query error boundaries, toast notifications via sonner
- Never swallow errors silently — always log or rethrow

## Dual Database Architecture

```
App SQLite (workspace.db)          Beads SQLite (.beads/beads.db)
├── Owner: Express/Drizzle          ├── Owner: br CLI
├── Access: Direct SQL               ├── Access: ONLY via execFile('br')
├── Contains: users, sessions,       ├── Contains: issues, deps, comments
│   captures, epics (metadata),      └── Sync: .beads/issues.jsonl (git)
│   notifications, activity_log
└── Not synced to git
```

**Epics bridge the two**: `epics.bead_epic_id` references a bead in br. Fetch bead details via `beadsService.show(beadId)`, never query beads.db directly.

## Testing

### Unit Tests (vitest)
- Co-located: `service.test.ts` next to `service.ts`
- Run: `pnpm test` (excludes integration tests)
- Mock external deps (DB, CLI tools) via `vi.mock()`
- 100+ tests currently passing

### Integration Tests (vitest + supertest)
- File pattern: `*.integration.test.ts`
- Run: `pnpm test:integration`
- Use `createTestDb()` from `db/test-db.ts` — creates in-memory SQLite with schema
- Use `cleanAllTables(sqlite)` in `beforeEach` for test isolation
- Mock only auth middleware, use real DB + real route logic
- Template: see `routes/captures.integration.test.ts`

### E2E Tests (Playwright)
- Location: `packages/client/e2e/`
- Run: `pnpm test:e2e` (auto-starts dev server)
- Chromium only, headed mode: `pnpm test:e2e:headed`
- Interactive UI: `pnpm test:e2e:ui`

### When to Write Which Test
- **Unit**: Service classes, utility functions, middleware logic
- **Integration**: Route handlers with real DB (CRUD correctness, validation, auth)
- **E2E**: User flows (navigation, form submission, real-time updates)

## Language Policy

- **App UI language**: English — all labels, buttons, messages, error texts, toasts, and user-facing strings in the application MUST be in English
- **Documentation** (`docs/`, `README.md`, comments): Vietnamese is allowed
- **Code** (variables, functions, types): English only
- **Bead titles/descriptions**: English

## Socket.IO Rooms & Events

```
project:<projectId>  — board updates, epic/capture changes, session lifecycle
session:<sessionId>  — agent NDJSON stream, Q&A events, progress
user:<userId>        — personal notifications
```

Key server→client events: `capture:created`, `epic:created`, `epic:updated`, `session:lifecycle`, `session:event`, `session:question`, `pr:event`, `notification`

## Role Permissions

| Action | PM | Dev | TechLead | Viewer |
|--------|:--:|:---:|:--------:|:------:|
| Capture ideas | ✅ | ✅ | ✅ | ❌ |
| Triage → Epic | ✅ | ❌ | ✅ | ❌ |
| Start Agent Session | ✅ | ✅ | ✅ | ❌ |
| Review/comment PR | ✅ | ✅ | ✅ | ❌ |
| Merge PR | ✅ | ❌ | ✅ | ❌ |
| Manage CM rules | ❌ | ❌ | ✅ | ❌ |
| View dashboard | ✅ | ✅ | ✅ | ✅ |


### Beads Viewer (bv) — AI Sidecar

**CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

```bash
bv --robot-triage              # Start here: ranked recommendations, quick wins, blockers
bv --robot-next                # Single top pick + claim command
bv --robot-plan                # Parallel execution tracks
bv --robot-triage --format toon  # Token-optimized output
```

Use `br` CLI for mutations (create/close/sync). Use `bv` for read-only triage and graph analysis.

### MCP Agent Mail

Async agent coordination via MCP tools. Register with `ensure_project` + `register_agent` using repo absolute path as `project_key`. Reserve files before editing with `file_reservation_paths`. Prefer macros (`macro_start_session`, `macro_prepare_thread`) for speed.
