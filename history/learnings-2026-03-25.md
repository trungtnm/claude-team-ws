# Daily Learning Digest — 2026-03-25

> 26 sessions analyzed across 3 projects (claude-team-ws, claude-code-utils, agents) | 5 deep-extracted

## Top 3 Actions for Next Session

1. **Run `/t:demo-to-prod`** — The greenfield pipeline is now complete (demo → ui-spec-writer → demo-to-prod → auto → onboard). The v1 branch has a full implementation ready to serve as reference for the production build.
2. **Test the boot ordering fix** — Verify that `pnpm dev` self-bootstraps correctly (migrate + seed on startup) on the v1 branch after the Drizzle programmatic migration fix.
3. **Consolidate v1 branch learnings** — The v1 branch has slug→ID resolution, boot ordering fixes, and UI polish that should be carried forward into the production implementation.

## Sessions Overview

| # | Project | Size | Branch | Topic | Key Outcome |
|---|---------|------|--------|-------|-------------|
| 1 | claude-team-ws | 7.1MB | main | Slug→ID resolution bug | Fixed Express middleware to resolve project slugs to IDs |
| 2 | claude-team-ws | 3.5MB | main | UI polish pass | Added spinners, diff coloring, focus rings, fade animations |
| 3 | claude-team-ws | 3.9MB | main | Full v1 build (/t:prime) | 6 commits: 42 server files + 37 client files pushed to v1 |
| 4 | claude-team-ws | 3.0MB | main | /t:prime + /t:polish | Full build + interrupted polish sweep |
| 5 | claude-code-utils | 124KB | main | Remove Co-Authored-By | Updated 4 skill files to suppress AI attribution in commits |
| 6 | claude-code-utils | 3.1MB | main | demo-to-prod skill pipeline | Integrated ui-spec-writer with demo-to-prod workflow |
| 7 | claude-team-ws | 535KB | v1 | Auth design + boot ordering | Fixed login (removed API key), fixed seed-before-migrate |
| 8 | claude-team-ws | 223KB | main | Created ui-spec-writer skill | 4-phase pipeline with stack detection for UI documentation |
| 9 | claude-team-ws | 15.9MB | main | Massive session: Agent SDK, porting | Ported components, cleaned up 218 throwaway sessions |
| 10 | claude-team-ws | 14.7MB | main | /t:prime full build | 6 commits: Agent SDK learnings, component porting, cleanup |
| 11 | claude-team-ws | 553KB | main | Full reset: clean slate | Deleted 151 files (22,703 lines), kept docs/specs as reference |
| 12 | claude-team-ws | 377KB | main | README enrichment | Updated README with current project state |
| 13 | claude-team-ws | 38KB | main | demo-to-prod advisory | Oracle analysis of project state for re-implementation |
| 14 | agents | 61KB | main | Health check planning | Designed liveness vs readiness endpoints |
| 15 | claude-team-ws | 375KB | main | Docker Compose planning | Planned docker-compose setup for Agent Mail + CM |
| 16-26 | various | <60KB | main | Testing, AskUserQuestion, Plan Mode exploration | Tool testing and minor explorations |

---

## Key Learnings

### Decisions & Trade-offs

- **[claude-team-ws] 4-agent concurrent build via MCP Agent Mail + bv triage**: The v1 build used 4 concurrent Claude Code sessions (CloudyGate, GoldBeacon, AzureWaterfall, WildCreek) coordinated through Agent Mail. Work was decomposed into 32 beads in a dependency graph. Agents used `bv --robot-triage` to find highest-impact unblocked work, claimed beads via `br update`, and broadcast completion over Agent Mail. When conflicts arose (two agents targeting the same bead), agents pivoted to other ready work rather than duplicating effort.
  - *Why it matters:* This is the first validated run of the multi-agent orchestration pattern at scale — 79 source files built in ~7 hours by 4 agents working in parallel.

- **[claude-team-ws] Slug→ID resolution via middleware, not per-route**: The project uses human-friendly slugs (`default`) in URLs but needs database IDs (`proj_default`) internally. After 3 failed attempts (req.params mutation, Object.defineProperty, direct mutation), landed on `getProjectId()` helper + `res.locals.projectId`. Express `req.params` mutation doesn't reliably propagate to child routers (due to shallow copy behavior).
  - *Why it matters:* Express Router `mergeParams` creates param copies — mutating `req.params` in middleware doesn't always propagate. This is a subtle Express gotcha worth remembering.

- **[claude-team-ws] Programmatic migration at startup, not just CLI**: Instead of requiring `pnpm db:migrate` before `pnpm dev`, the server now calls Drizzle's `migrate()` programmatically inside the seed function. Boot sequence: SQLite file created → `migrate()` ensures schema → `seed()` ensures default data → routes mounted → server listening.
  - *Why it matters:* Drizzle's `migrate()` is idempotent (uses `__drizzle_migrations` tracking table), so it's safe to call on every boot. Eliminates the "forgot to run migrations" class of bugs.

- **[claude-team-ws] Auth: email-only login for humans, Bearer API key for machines**: The v1 initially required an API key for login, which was wrong. Changed to email-only login (JWT in httpOnly cookie). The `api_key` column stays in the schema and `authenticate` middleware still supports `Authorization: Bearer <api_key>` for programmatic/CI access. Socket.IO auth reads the cookie from handshake headers (httpOnly cookies are invisible to JS).
  - *Why it matters:* Dual auth paths (cookie for browsers, Bearer for APIs) is the right pattern for tools that serve both humans and automated agents.

- **[claude-code-utils] "Flag, don't invent" + "Demo is sacred" principles**: When documenting a demo UI, if data is shown that no API endpoint provides, the spec flags it as `⚠️ UNMAPPED` rather than guessing. And for production implementation, the demo UI must be copied pixel-for-pixel — agents must not rebuild UI from specs (causes visual drift).
  - *Why it matters:* In multi-agent workflows, false assumptions compound. Explicit uncertainty markers and pixel-fidelity requirements prevent integration failures.

### Problems Solved

- **[claude-team-ws] Slug→ID resolution bug → `getProjectId()` helper**: URLs used project slug (`default`) but server looked up by ID (`proj_default`). Debugging approach: curl endpoint testing → direct SQLite inspection (confirmed `proj_default` in DB) → middleware tracing (200 from middleware, empty from routes) → narrowed to params propagation. Three failed approaches before the final fix using `res.locals`.
  - *Pattern:* When middleware resolves/normalizes a value, store it in `res.locals` — never rely on `req.params` mutation propagating through Express Router hierarchies.

- **[claude-team-ws] Socket.IO auth completely broken (found during /t:peer-review)**: Three related bugs: (a) `setUserLookup()` never called in `index.ts` so every WebSocket connection failed, (b) server only accepted `auth.token` but client uses httpOnly cookies JS can't read, (c) client called `connectSocket()` without a token. Fixed by adding cookie-based auth to the Socket.IO handshake.
  - *Pattern:* Multi-agent codebases need a multi-pass review pipeline (`/t:peer-review` → `/t:fresh-eyes` → `/t:polish`) because integration bugs are invisible to individual agents.

- **[claude-team-ws] Express 5 `req.params` type regression**: Express 5 types `req.params` as `{}` when no generics are specified, breaking `req.params.projectId`. Also, 5 nested routes were missing `mergeParams: true`. Found during peer review.
  - *Pattern:* Express 4→5 migration requires explicit generic typing on route handlers and `mergeParams` on every nested Router.

- **[claude-team-ws] Boot ordering: seed() before tables exist**: `pnpm dev` uses `tsx watch` which skips `drizzle-kit migrate`. Also discovered that `authRouter` was never mounted in `index.ts` — that was the actual "Not Found" error on the login screen. Two separate bugs masquerading as one.
  - *Pattern:* Self-bootstrapping servers should run migrations programmatically at startup. And always verify route mounting in `index.ts`.

- **[claude-team-ws] Client/server login contract mismatch**: Client sent `{ email: "..." }` but server expected `{ api_key: "..." }`. Classic multi-agent integration bug where one agent modified the interface without the other knowing.
  - *Pattern:* Multi-agent builds need shared interface contracts (TypeScript types in a shared package, or API specs) to prevent drift.

### Techniques Discovered

- **Stack-adaptive skill design (STACK_PROFILE concept)**: The ui-spec-writer skill detects the project's framework/library stack from `package.json` and adapts its output terminology. A Vue project gets "composables" and "defineProps", React gets "hooks" and "props". This makes specs feel native to whatever framework is used.
  - *When to use:* Any skill that generates documentation or code specs should detect and adapt to the project's stack rather than assuming React.

- **Greenfield pipeline for AI-driven development**: `Build demo → /ui-spec-writer → /t:demo-to-prod → /t:auto (backend agents) → /t:onboard`. Each step feeds into the next — specs inform the copy, the copy generates backend beads, agents execute beads, onboard helps test.
  - *When to use:* Starting a new feature from a visual prototype through to production implementation.

- **Health check three-tier architecture**: `healthy` → `degraded` (Docker/CLI issues) → `unhealthy` (DB down, 503). Two endpoints: `/api/health` (fast liveness) and `/api/health/ready` (full readiness with dependency checks). Dependency checks use `Promise.all` with per-check `Promise.race` timeouts.
  - *When to use:* Any Express server with external dependencies (Docker services, CLI tools, databases).

### Mistakes & Course Corrections

- **Co-Authored-By trailer in commits**: Claude Code's built-in system prompt adds `Co-Authored-By: Claude Opus 4.6...` to commits. The user didn't want this. Fixed by adding explicit "No Co-Authored-By" rules to 4 skill files (`t:commit`, `t:done`, `t:handoff`, `worker`). Custom skill instructions override built-in defaults because they're injected as higher-priority context.
  - *Lesson:* Claude Code's default behaviors can be overridden per-project via skill instructions. When you don't want a default, add an explicit negation to relevant skills.

- **Express `req.params` mutation doesn't propagate**: Initial fix for slug resolution tried mutating `req.params.projectId` in middleware. This worked for some routes but not others (especially newer routes using `mergeParams`). Had to switch to `res.locals` approach.
  - *Lesson:* Express creates shallow copies of params for child routers. Never rely on `req.params` mutation as an inter-middleware communication channel.

### Effective Patterns

- **Multi-agent orchestration pipeline**: `/t:prime` → `/t:auto` → `/t:peer-review` → `/t:fresh-eyes` → `/t:polish` → `/t:commit`. Each command has a specific role: prime reads docs, auto claims and builds beads in a loop, peer-review dispatches 3 parallel subagents (security, server, client reviewers), fresh-eyes re-reads all modified files, polish does UI sweep, commit groups changes logically. This pipeline caught 7+ critical integration bugs that individual agents missed.
  - *When to use:* Any multi-agent build. The review phases are essential — not optional polish.

- **Socket event invalidation pattern (TanStack Query)**: Socket.IO events (e.g., `capture:created`) trigger `queryClient.invalidateQueries({ queryKey: ['captures'] })` rather than manually updating state. This keeps TanStack Query as the single source of truth for server data. The `useSocketEvent` hook uses a ref to avoid re-subscribing when handler identity changes (stale closure prevention).
  - *When to use:* Any React app with real-time updates via WebSocket + TanStack Query.

- **Dependency injection in Express route factories**: Routes use `createXxxRouter(deps)` factory functions. This enables integration testing with in-memory databases without mocking Express internals. Example: `createAuthRouter({ db: testDb })`.
  - *When to use:* All Express route modules that need integration testing.

- **UI polish checklist pattern**: Systematic sweep covering: (1) replace text loaders with spinners, (2) add diff line coloring, (3) empty states with icons, (4) card interactivity (cursor-pointer, hover shadows), (5) focus rings for keyboard accessibility, (6) selection color matching theme, (7) fade-in animations. All using existing design tokens.
  - *When to use:* After initial feature implementation, before user testing.

- **4-phase skill pipeline (Discovery → Inventory → Per-Page Specs → Summary)**: Each phase builds on the previous. Discovery detects the stack via STACK_PROFILE (covers 7 frameworks, 12+ library categories) and adapts all downstream output terminology. One file per page enables parallel agent assignment.
  - *When to use:* Building skills that need to work across different tech stacks.

### Preferences & Workflow Insights

- **User prefers workflow-driven designs over generic tool wrappers**: The user designs skills as connected pipelines (demo → spec → prod → test) rather than standalone utilities. Each skill should know about and feed into adjacent skills. The `<AUTONOMOUS>` directive + "flag, don't invent" rule embodies the preference: run autonomously but flag genuine ambiguities.
  - *Apply when:* Creating or modifying skills — always consider upstream inputs and downstream consumers.

- **User wants no AI attribution in commits**: Explicit preference against Co-Authored-By trailers. This is a permanent preference across all projects.
  - *Apply when:* All commit-related operations.

- **"Demo is sacred" — UI fidelity is paramount**: The core frustration was that letting agents rebuild UI from specs causes visual drift from the original demo. The solution: copy demo markup pixel-for-pixel, then wire backend. Never let agents reinterpret the design.
  - *Apply when:* Any `/t:demo-to-prod` or production implementation from a prototype.

- **Demos are React+shadcn+Tailwind by default**: Commands and skills should treat React+shadcn as the primary demo format. Static HTML is the fallback path, not the primary one.
  - *Apply when:* Building or modifying demo-to-prod workflows.

- **User tests Claude Code capabilities hands-on**: Multiple sessions were dedicated to testing Plan Mode, AskUserQuestion tool, image reading, and agent behaviors before building production features. This "try before you build" approach informed the final skill designs.
  - *Apply when:* The user is exploring new Claude Code features — provide concrete examples and help them experiment.

### Effective Prompts

- **"after working with the Agent to create and improve the demo UI/UX, i want to command it to write details documents for every page and UI/UX components, so that other Agents could start implementing the real business logics"** — This prompt perfectly described the multi-agent handoff problem and led to creating the `ui-spec-writer` skill.
- **"why login require API key? the Agent Session with Claude Code will use OAuth login method, not API key"** — Direct challenge to a design decision that led to simplifying the auth flow.

### External Knowledge Referenced

- No new external references this period. All work was internal to the project ecosystem.

---

## Quick Reference

### Commands Worth Remembering
```
bv --robot-triage                    # Graph-aware triage for beads
br sync --flush-only                 # Sync beads state to git
python3 extract-sessions.py --summary  # Light session overview
pnpm dev                             # Self-bootstrapping dev server (migrate + seed + start)
```

### Code Snippets Worth Keeping
```typescript
// Express middleware: store resolved values in res.locals, not req.params
export function getProjectId(req: Request, res: Response): string {
  return (res.locals.projectId as string) || req.params.projectId;
}

// Self-bootstrapping server: call migrate() programmatically
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
async function seed() {
  await migrate(db, { migrationsFolder: './drizzle' }); // idempotent
  // ... seed data
}

// Socket event invalidation with stale closure prevention
function useSocketEvent(event: string, handler: (data: any) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler; // always fresh
  useEffect(() => {
    socket.on(event, (...args) => handlerRef.current(...args));
    return () => { socket.off(event); };
  }, [event]); // no handler in deps = no re-subscribe
}

// Route factory pattern for DI in integration tests
export function createAuthRouter(deps: { db: Database }) {
  const router = Router();
  router.post('/login', async (req, res) => { /* uses deps.db */ });
  return router;
}
```

---

## Observations (Evidence-Based)

### Sessions where the user expressed satisfaction
- Session #1 (slug fix): "All 200! Every endpoint works with the slug `default`" — confirmed the fix was comprehensive
- Session #3 (v1 build): Successfully pushed 6 commits covering full server + client — complete implementation in one session
- Session #8 (ui-spec-writer): Accepted the 4-phase pipeline design without corrections — validated the approach

### Sessions where course corrections were needed
- Session #5 (Co-Authored-By): User had to explicitly request removal of AI attribution — a preference that should have been anticipated
- Session #7 (auth): User challenged the API key login design — the implementation assumed the wrong auth model
- Session #1 (slug fix): Multiple iterations needed — first tried `req.params` mutation, then `Object.defineProperty`, before landing on `res.locals` + helper function

### Cross-session themes
- **Pipeline thinking**: The day was dominated by building connected workflows — skills that feed into each other, endpoints that chain through middleware, demo→spec→prod pipelines
- **Multi-agent coordination at scale**: First validated 4-agent concurrent build (79 files, ~7 hours). Critical success factors: pre-decomposed work into dependency-aware beads, agents pivoting when blocked rather than waiting, and multi-pass review pipeline catching integration bugs
- **Self-bootstrapping**: Multiple fixes aimed at making things "just work" without manual steps (auto-migrate, auto-seed, skill auto-detection)
- **Integration bugs are the dominant failure mode**: 5 of the 7 critical bugs found were integration issues between agents — contract mismatches, missing route mounting, Socket.IO auth mismatch. Individual agent work was correct in isolation.
- **Clean slate mentality**: Deleted 151 files (22,703 lines) to start fresh, cleaned up 218 throwaway sessions — the user values a clean workspace

### Areas worth exploring further
- The v1 branch has working code that should inform the production implementation via `/t:demo-to-prod`
- The health check plan (liveness vs readiness, three-tier status) hasn't been implemented yet
- Docker Compose setup for Agent Mail + CM was planned but implementation status unclear

---

## Integration Checks

- **Beads**: No bead ID patterns found in extracted conversations (the v1 branch closed all 32 beads before the period analyzed)
- **CM**: Suggest running `cm reflect` to extract procedural memories from today's sessions
- **DECISIONS.md**: `.ccu/DECISIONS.md` not checked — consider recording the slug→ID resolution pattern and boot ordering fix
- **HANDOFF.md**: No handoff artifacts found for this period
- **Previous digest**: First digest — no comparison available

---

## Suggested Memory Entries

> Ready-to-save entries for auto-memory. Review and approve.

### feedback: no-co-authored-by
User does not want Co-Authored-By trailers in git commits. Custom skill instructions in t:commit, t:done, t:handoff, and worker explicitly suppress this.
**Why:** User preference for clean commit history without AI attribution.
**How to apply:** Never include Co-Authored-By lines in commit messages across all projects.

### feedback: workflow-pipeline-design
User prefers skills designed as connected pipelines (demo → spec → prod → test) rather than standalone utilities. Each skill should know about and feed into adjacent skills.
**Why:** Multi-agent handoff requires explicit data flow between stages.
**How to apply:** When creating or modifying skills, always consider upstream inputs and downstream consumers.

### feedback: demo-is-sacred
When converting demos to production, copy UI pixel-for-pixel. Never let agents rebuild UI from specs — that causes visual drift. Demos are React+shadcn+Tailwind by default, not raw HTML.
**Why:** User's core frustration was that spec-based UI rebuilds drift from the original demo design.
**How to apply:** In any demo-to-prod workflow, copy first, wire backend later. Never reinterpret the design.

### project: v1-branch-as-reference
v1 branch (2026-03-24/25) contains a complete working implementation: 14 routes, 10 services, 14-table schema, 8 pages, 9 hooks. Built by 4 concurrent agents (32 beads, all closed). Includes fixes for slug→ID resolution, boot ordering, Socket.IO auth, and Express 5 type regression.
**Why:** The v1 was built as a rapid prototype to validate architecture and multi-agent coordination before production implementation.
**How to apply:** When starting production implementation, reference v1 branch patterns especially middleware, service architecture, and the Socket.IO auth cookie approach.

### project: multi-agent-integration-bugs
In the 4-agent v1 build, 5 of 7 critical bugs were integration issues invisible to individual agents: contract mismatches, missing route mounting, Socket.IO auth mismatch. The /t:peer-review → /t:fresh-eyes → /t:polish pipeline is essential, not optional.
**Why:** Multi-agent codebases have an inherent integration testing gap.
**How to apply:** Always run the full review pipeline after multi-agent builds. Budget review time equal to build time.
