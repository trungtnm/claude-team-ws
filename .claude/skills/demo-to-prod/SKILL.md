---
name: demo-to-prod
description: Convert the ui/ demo prototype into production code in packages/client and packages/server. Use when starting or continuing the demo-to-production conversion.
argument-hint: [phase|page] [--auto]
---

# Demo to Production — claude-team-ws

Convert the working demo UI (`ui/`) into production code (`packages/client/` + `packages/server/`).

**Philosophy:** The demo IS the final product UI. Specs supplement with backend architecture. If demo and specs conflict on UI, demo wins.

## Sources of Truth

| Concern | Source | Location |
|---------|--------|----------|
| UI/UX (what users see) | **Demo** | `ui/src/` |
| Agent SDK patterns | **Playground** | `playgrounds/agents/` |
| Backend architecture | **Specs** | `docs/00-09` |
| Data shape gaps | **UI Specs** | `docs/ui-specs/99-summary.md` |
| API contracts | **API Spec** | `docs/02-api-specification.md` |
| Socket.IO events | **Socket Spec** | `docs/04-socket-io-events.md` |
| Dependencies | **Deps doc** | `docs/07-dependencies.md` |
| Compiled server (reference) | **Bundle** | `packages/server/dist/index.js` |

## Arguments

- No args: show status of what's been converted vs remaining
- `phase1` / `phase2` / `phase3` / `phase4` / `phase5`: execute a specific phase
- `<page-name>`: convert a specific page (e.g., `board`, `captures`, `agents`, `settings`, `graph`, `pr-review`)
- `--auto`: after current phase, file beads for next phase and continue automatically

## Pre-flight Checks

Before ANY work, verify:
1. `ui/` demo exists and has source files
2. Check what's already been converted in `packages/client/src/` and `packages/server/src/`
3. Read `docs/ui-specs/99-summary.md` for the gap analysis and implementation order
4. Read `docs/ui-specs/01-shared-infrastructure.md` for TanStack Query keys and patterns
5. Check beads state: `bv --robot-triage --format toon` for any existing work
6. Report current state to user before proceeding

---

## Execution Model

### Single-Agent Mode (default)
Run phases sequentially in one session. Good for Phase 1-3 (foundation work).

### Multi-Agent Mode (`--auto` or manual)
Phase 4 pages are **independent and parallelizable**. After Phase 3 completes, file beads per page, then spawn parallel agents.

**Orchestration pipeline:**
```
Phase 1-3: Single session (foundation — MUST be sequential)
    │
    ├── File page beads with dependencies on Phase 3
    │
    ▼
Phase 4: Parallel agents (one per page or page-group)
    │   Each agent: /t:auto or /demo-to-prod <page-name>
    │   Coordination: Agent Mail file reservations
    │
    ▼
Phase 5: Single session (verify + polish)
    │   /t:peer-review → /t:fresh-eyes → /t:polish → /t:commit
```

**To spawn parallel agents for Phase 4:**
```bash
# Terminal 1 — Board + Captures (related: both use epics)
claude --agent-name BoardAgent
# Then: /demo-to-prod board
# Then: /demo-to-prod captures

# Terminal 2 — Agents + Stream (use playground patterns)
claude --agent-name AgentsAgent
# Then: /demo-to-prod agents

# Terminal 3 — Settings + Graph + PR Review
claude --agent-name SettingsAgent
# Then: /demo-to-prod settings
# Then: /demo-to-prod graph
# Then: /demo-to-prod pr-review
```

**Agent Mail coordination (each agent MUST do this):**
1. Register: `ensure_project` + `register_agent` with this repo's absolute path
2. Reserve files before editing: `file_reservation_paths(project_key, agent_name, ["packages/client/src/pages/<page>*", "packages/client/src/components/<domain>/**", "packages/client/src/hooks/use-<domain>*"], ttl_seconds=3600, exclusive=true)`
3. Release files after committing: `release_file_reservations`
4. Report completion: `send_message` to coordinator thread

**Shared files (non-exclusive reservation):**
- `packages/client/src/lib/query-keys.ts` — agents append new keys
- `packages/client/src/lib/api.ts` — agents add new endpoint functions
- `packages/server/src/routes/index.ts` — agents register new routers

---

## Phase 1: Scaffold Production Packages

**Goal:** Get `packages/client/` and `packages/server/` buildable with empty shells.

1. **Reconstruct package.json files** — Read `docs/07-dependencies.md` for exact versions. Create `packages/client/package.json` and `packages/server/package.json`.
2. **Reconstruct build config** — tsconfig.json, vite.config.ts, drizzle.config.ts. Reference `docs/` and the compiled `dist/index.js` for structure.
3. **Copy demo UI wholesale** — Copy `ui/src/` → `packages/client/src/` preserving exact directory structure:
   - `pages/`, `components/`, `stores/`, `data/`, `lib/`, `app.tsx`, `main.tsx`, `index.css`
4. **Copy shadcn/ui primitives** — Ensure `packages/client/src/components/ui/` has all 13 primitives from the demo.
5. **Verify build** — `cd packages/client && pnpm install && pnpm build` must succeed.
6. **Track work** — Create bead: `br create --title "Phase 1: Scaffold production packages" --labels demo-to-prod --priority p1`

**DO NOT modify any demo component code in this phase.** Copy exactly as-is.

**On completion with `--auto`:** commit, close bead, proceed to Phase 2.

## Phase 2: Shared Infrastructure Layer

**Goal:** Add the plumbing that the demo lacks so pages can be wired to real data.

Reference: `docs/ui-specs/01-shared-infrastructure.md`

1. **API client** — Create `packages/client/src/lib/api.ts` with typed fetch wrapper. Pattern reference: `playgrounds/agents/src/lib/api.ts`
2. **TanStack Query provider** — Add QueryClientProvider to `app.tsx`. Define query key factory in `lib/query-keys.ts` per spec.
3. **Socket.IO client** — Create `packages/client/src/lib/socket.ts` connection manager with auth, room join/leave, reconnection. Reference: `playgrounds/agents/src/lib/socket.ts`
4. **Auth context** — Replace hardcoded `currentUser` with `GET /api/auth/me` via TanStack Query. Add route guards.
5. **Project scoping** — Update router from flat routes (`/board`) to project-scoped (`/projects/:projectId/board`). Add project context provider.
6. **Server skeleton** — Create `packages/server/src/index.ts` with Express + Socket.IO setup, middleware chain, and route mounting. Reference: `packages/server/dist/index.js` for the structure.
7. **Database setup** — Drizzle schema + connection from specs. SQLite with WAL mode.
8. **Verify** — Both packages build. Server starts. Client connects.
9. **Track work** — Create bead: `br create --title "Phase 2: Shared infrastructure layer" --labels demo-to-prod --priority p0`

**Rule:** Infrastructure code must be REAL, not stubs. Follow the Golden Rule — no `// TODO` placeholders.

**On completion with `--auto`:** commit, close bead, proceed to Phase 3.

## Phase 3: Server Routes & Services

**Goal:** Build the backend that serves the demo's data shapes.

1. **Derive interfaces from demo data files** — Read each `ui/src/data/*.ts` mock file. These define what the frontend expects. Create TypeScript interfaces in `packages/server/src/types/`.
2. **Reconcile with DB schema** — Use `docs/ui-specs/99-summary.md` "Data Shape Mismatches" table. Where demo has fields not in DB (e.g., `User.initials`, `User.color`), compute them in the API response layer. Where DB has fields not in demo, include them in the API but don't break the frontend.
3. **Build routes** — One Express Router per domain in `packages/server/src/routes/`. Reference `docs/02-api-specification.md` for endpoints. Every mutation emits Socket.IO events per `docs/04-socket-io-events.md`.
4. **Build services** — CLI wrappers (br, bv, git, gh) via `execFile`. Agent service from `playgrounds/agents/server/session-manager.ts`. Agent Mail + CM via fetch to host services (NOT Docker — these run on the host machine).
5. **Seed data** — Create seed script that populates the DB with the demo's mock data so the UI looks identical on first run.
6. **Verify** — `pnpm test:integration` passes. API returns data matching demo shapes.
7. **Track work** — Create bead: `br create --title "Phase 3: Server routes and services" --labels demo-to-prod --priority p0`

**Agent domain special rule:** Copy `playgrounds/agents/server/session-manager.ts` as the starting point for `packages/server/src/services/agent-service.ts`. This is production-quality code, not demo code.

**On completion with `--auto`:** commit, close bead, **file Phase 4 page beads**, then proceed.

### Phase 3 → Phase 4 Bead Filing

After Phase 3 is verified, file one bead per page for parallel agent work:

```bash
# Create parent epic bead
br create --title "Phase 4: Wire frontend pages" --type epic --labels demo-to-prod --priority p0

# Create page beads (all depend on Phase 3 completion)
br create --title "Wire Board page (epics CRUD, DnD)" --labels demo-to-prod,frontend --priority p1
br create --title "Wire Captures page (capture CRUD, triage)" --labels demo-to-prod,frontend --priority p1
br create --title "Wire Agents + Stream pages (session lifecycle, streaming)" --labels demo-to-prod,frontend --priority p1
br create --title "Wire Notifications (header dropdown, Socket.IO push)" --labels demo-to-prod,frontend --priority p2
br create --title "Wire PR Review page (GitHub API, diff viewer)" --labels demo-to-prod,frontend --priority p2
br create --title "Wire Graph page (bv integration, ReactFlow)" --labels demo-to-prod,frontend --priority p2
br create --title "Wire Settings page (5 tabs, config CRUD)" --labels demo-to-prod,frontend --priority p2

# Add dependencies: each page depends on the Phase 3 bead
# br dep add <page-bead-id> <phase3-bead-id>

br sync --flush-only
```

**Output to user:** Print the bead IDs and instructions for spawning parallel agents.

## Phase 4: Wire Frontend Pages

**Goal:** Replace static mock imports with TanStack Query hooks, one page at a time.

### Per-Page Procedure

For EACH page (when invoked as `/demo-to-prod <page-name>`):

1. **Claim the bead** — `br update <bead-id> --status in_progress`
2. **Reserve files via Agent Mail** — Exclusive reservation on the page's files:
   - `packages/client/src/pages/<page-name>-page.tsx`
   - `packages/client/src/components/<domain>/**`
   - `packages/client/src/hooks/use-<domain>*.ts`
3. **Read the page's spec** — e.g., `docs/ui-specs/board-page.md`
4. **Read the demo page code** — e.g., `packages/client/src/pages/board-page.tsx` + its components
5. **Identify all `import from '@/data/*'`** — These are the wiring points
6. **Create query hooks** — e.g., `hooks/use-epics.ts` with `useQuery`/`useMutation` calling the API client
7. **Replace imports** — Swap static data imports with query hook calls
8. **Replace Zustand server-data stores** — Keep only UI-state stores (sidebar open, filters, selections). Server data goes through TanStack Query.
9. **Add Socket.IO subscriptions** — For real-time events, invalidate query keys on socket events
10. **Preserve exact UI** — The rendered output must look identical to the demo. NO layout/style changes.
11. **Verify** — Page renders with real API data. Real-time updates work.
12. **Close bead** — `br close <bead-id> --reason "Wired <page> to production API"`
13. **Release file reservations** — Release Agent Mail reservations
14. **Notify other agents** — `send_message` to the project thread confirming completion

### Page-Specific Notes

**Board** (`/demo-to-prod board`):
- Spec: `docs/ui-specs/board-page.md`
- Components: `board-column`, `epic-card`, `epic-detail-sheet`, `epic-create-dialog`, `filter-bar`, `priority-badge`, `bead-list`, `bead-detail-dialog`
- Wire: epics CRUD, column DnD via `@dnd-kit`, bead list via `br show`
- Store: Replace `board-store.ts` server data → TanStack Query. Keep filter/column UI state.

**Captures** (`/demo-to-prod captures`):
- Spec: `docs/ui-specs/captures-page.md`
- Components: `capture-composer`, `capture-card`, `capture-inbox`, `capture-fab`, `triage-dialog`
- Wire: capture CRUD, triage flow (AI-powered → real API), `Cmd+J` shortcut
- Store: Replace `capture-store.ts` → TanStack Query. Keep composer open/close state.

**Agents** (`/demo-to-prod agents`):
- Spec: `docs/ui-specs/agents-page.md`
- Components: `agent-stream-view`, `stream-event`, `session-stats-bar`, `ask-question-dialog`, `session-card`
- **Special:** Copy components and hooks from `playgrounds/agents/src/` — they have working TanStack Query + Socket.IO + Agent SDK patterns. Adapt import paths.
- Wire: session CRUD, live NDJSON streaming via Socket.IO, AskUserQuestion flow, context window gauge
- Store: Replace `agent-store.ts` → TanStack Query + Socket.IO events.

**Notifications** (`/demo-to-prod notifications`):
- Component: `layout/notification-dropdown.tsx`
- Wire: `GET /api/notifications`, Socket.IO `notification` event on `user:<id>` room, mark-as-read mutation

**PR Review** (`/demo-to-prod pr-review`):
- Spec: `docs/ui-specs/pr-review-page.md`
- Components: `pr-review-layout`, `file-tree`, `diff-viewer`, `ai-review-summary`, `comment-thread`
- Wire: GitHub API via `gh-service`, real diff data, comment posting, merge flow

**Graph** (`/demo-to-prod graph`):
- Spec: `docs/ui-specs/graph-page.md`
- Components: `dependency-graph`, `graph-node`, `graph-legend`, `graph-controls`
- Wire: `bv --robot-graph --graph-format=json` for data, ReactFlow rendering, live updates via `beads:changed` socket event

**Settings** (`/demo-to-prod settings`):
- Spec: `docs/ui-specs/settings-page.md`
- Components: `project-tab`, `repos-tab`, `add-repo-dialog`, `users-tab`, `rules-tab`, `webhooks-tab`
- Wire: 5 separate API domains, each tab is independently wireable

## Phase 5: Polish & Verify

**Goal:** Ensure production matches demo pixel-for-pixel and all real-time features work.

1. **Visual comparison** — Open demo (`ui/`) and production (`packages/client/`) side by side. Page by page, component by component. Flag any drift.
2. **Wire remaining features:**
   - Drag-and-drop on board (`@dnd-kit` is imported but not activated in demo)
   - `Cmd+K` search (if implementing)
   - Beads sync conflict banner
   - Agent Mail thread viewer
3. **Multi-pass review** — Run the validated review pipeline:
   ```
   /t:peer-review    → 3 parallel reviewers (security, server, client)
   /t:fresh-eyes     → Re-read all modified code for bugs
   /t:polish         → UI/UX sweep for Stripe-level quality
   ```
4. **E2E tests** — Write Playwright tests for critical flows: login → board → create epic → start agent → view stream
5. **Run full test suite** — `pnpm test && pnpm test:integration && pnpm test:e2e`
6. **File remaining beads** — For any P2/P3 features deferred
7. **Final commit** — `/t:commit` for logically grouped commits

## Rules

- **Demo is sacred** — Production UI must look identical to the demo. When in doubt, match the demo.
- **No stubs in production** — Follow the Golden Rule from CLAUDE.md. Real implementations or file a bead and skip.
- **Copy first, refactor later** — Get it working with copied code before abstracting.
- **Types from demo data** — Demo mock files define the API contract. Backend serves those shapes.
- **One page at a time** — Convert each page fully before moving to the next.
- **Preserve Vietnamese diacritics** — All Vietnamese text must use full dấu.
- **Use playground patterns** — `playgrounds/agents/` has working TanStack Query + Socket.IO + Agent SDK code. Copy those patterns.
- **Verify at every phase** — Build must pass. Tests must pass. No broken state between phases.
- **Host services, not Docker** — Agent Mail, CM, and CASS run on the host machine. Connect via localhost, not Docker network.
- **Agent Mail for coordination** — In multi-agent mode, ALWAYS reserve files before editing and release after committing. Use the pre-commit guard.
- **Beads for tracking** — Every phase and page gets a bead. Close on completion. `br sync --flush-only` after every mutation.
