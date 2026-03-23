# CLAUDE.md — claude-team-ws

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
- Long-running processes (claude CLI): use `child_process.spawn` with NDJSON streaming
- All service errors must include context: `throw new Error(\`BeadsService.show failed for ${beadId}: ${err.message}\`)`

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


### Using bv as an AI sidecar

bv is a graph-aware triage engine for Beads projects (.beads/beads.jsonl). Instead of parsing JSONL or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). For agent-to-agent coordination (messaging, work claiming, file reservations), use [MCP Agent Mail](https://github.com/Dicklesworthstone/mcp_agent_mail).

**⚠️ CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command

# Token-optimized output (TOON) for lower LLM context usage:
bv --robot-triage --format toon
export BV_OUTPUT_FORMAT=toon
bv --robot-next

#### Other Commands

**Planning:**
| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with `unblocks` lists |
| `--robot-priority` | Priority misalignment detection with confidence |

**Graph Analysis:**
| Command | Returns |
|---------|---------|
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS (hubs/authorities), eigenvector, critical path, cycles, k-core, articulation points, slack |
| `--robot-label-health` | Per-label health: `health_level` (healthy\|warning\|critical), `velocity_score`, `staleness`, `blocked_count` |
| `--robot-label-flow` | Cross-label dependency: `flow_matrix`, `dependencies`, `bottleneck_labels` |
| `--robot-label-attention [--attention-limit=N]` | Attention-ranked labels by: (pagerank × staleness × block_impact) / velocity |

**History & Change Tracking:**
| Command | Returns |
|---------|---------|
| `--robot-history` | Bead-to-commit correlations: `stats`, `histories` (per-bead events/commits/milestones), `commit_index` |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues, cycles introduced/resolved |

**Other Commands:**
| Command | Returns |
|---------|---------|
| `--robot-burndown <sprint>` | Sprint burndown, scope changes, at-risk items |
| `--robot-forecast <id\|all>` | ETA predictions with dependency-aware scheduling |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |
| `--export-graph <file.html>` | Self-contained interactive HTML visualization |

#### Scoping & Filtering

bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
bv --robot-triage --robot-triage-by-track    # Group by parallel work streams
bv --robot-triage --robot-triage-by-label    # Group by domain

#### Understanding Robot Output

**All robot JSON includes:**
- `data_hash` — Fingerprint of source beads.jsonl (verify consistency across calls)
- `status` — Per-metric state: `computed|approx|timeout|skipped` + elapsed ms
- `as_of` / `as_of_commit` — Present when using `--as-of`; contains ref and resolved SHA

**Two-phase analysis:**
- **Phase 1 (instant):** degree, topo sort, density — always available immediately
- **Phase 2 (async, 500ms timeout):** PageRank, betweenness, HITS, eigenvector, cycles — check `status` flags

**For large graphs (>500 nodes):** Some metrics may be approximated or skipped. Always check `status`.

#### jq Quick Reference

bv --robot-triage | jq '.quick_ref'                        # At-a-glance summary
bv --robot-triage | jq '.recommendations[0]'               # Top recommendation
bv --robot-plan | jq '.plan.summary.highest_impact'        # Best unblock target
bv --robot-insights | jq '.status'                         # Check metric readiness
bv --robot-insights | jq '.Cycles'                         # Circular deps (must fix!)
bv --robot-label-health | jq '.results.labels[] | select(.health_level == "critical")'

**Performance:** Phase 1 instant, Phase 2 async (500ms timeout). Prefer `--robot-plan` over `--robot-insights` when speed matters. Results cached by data hash.

Use bv instead of parsing beads.jsonl—it computes PageRank, critical paths, cycles, and parallel tracks deterministically.

## MCP Agent Mail: coordination for multi-agent workflows

What it is
- A mail-like layer that lets coding agents coordinate asynchronously via MCP tools and resources.
- Provides identities, inbox/outbox, searchable threads, and advisory file reservations, with human-auditable artifacts in Git.

Why it's useful
- Prevents agents from stepping on each other with explicit file reservations (leases) for files/globs.
- Keeps communication out of your token budget by storing messages in a per-project archive.
- Offers quick reads (`resource://inbox/...`, `resource://thread/...`) and macros that bundle common flows.

How to use effectively
1) Same repository
   - Register an identity: call `ensure_project`, then `register_agent` using this repo's absolute path as `project_key`.
   - Reserve files before you edit: `file_reservation_paths(project_key, agent_name, ["src/**"], ttl_seconds=3600, exclusive=true)` to signal intent and avoid conflict.
   - Communicate with threads: use `send_message(..., thread_id="FEAT-123")`; check inbox with `fetch_inbox` and acknowledge with `acknowledge_message`.
   - Read fast: `resource://inbox/{Agent}?project=<abs-path>&limit=20` or `resource://thread/{id}?project=<abs-path>&include_bodies=true`.
   - Tip: set `AGENT_NAME` in your environment so the pre-commit guard can block commits that conflict with others' active exclusive file reservations.

2) Across different repos in one project (e.g., Next.js frontend + FastAPI backend)
   - Option A (single project bus): register both sides under the same `project_key` (shared key/path). Keep reservation patterns specific (e.g., `frontend/**` vs `backend/**`).
   - Option B (separate projects): each repo has its own `project_key`; use `macro_contact_handshake` or `request_contact`/`respond_contact` to link agents, then message directly. Keep a shared `thread_id` (e.g., ticket key) across repos for clean summaries/audits.

Macros vs granular tools
- Prefer macros when you want speed or are on a smaller model: `macro_start_session`, `macro_prepare_thread`, `macro_file_reservation_cycle`, `macro_contact_handshake`.
- Use granular tools when you need control: `register_agent`, `file_reservation_paths`, `send_message`, `fetch_inbox`, `acknowledge_message`.

Common pitfalls
- "from_agent not registered": always `register_agent` in the correct `project_key` first.
- "FILE_RESERVATION_CONFLICT": adjust patterns, wait for expiry, or use a non-exclusive reservation when appropriate.
- Auth errors: if JWT+JWKS is enabled, include a bearer token with a `kid` that matches server JWKS; static bearer is used only when JWT is disabled.
