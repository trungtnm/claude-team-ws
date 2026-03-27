# Discovery Report — Activity + Metrics Page

## 1. Data Layer

### activity_log table (schema.ts:205-227)
- 8 action types defined in enum
- **Only 4 actively logged**: capture_created, epic_created, session_started, pr_merged
- **Not logged yet**: session_completed, session_failed, pr_created, rule_created, bead_status_changed
- Index: `(project_id, created_at)` — efficient for time-range queries
- `details` field: JSON string with context (session_id, capture_id, epic_id, pr_url)
- **No existing SELECT queries** — table is write-only currently

### sessions table (schema.ts:97-120)
- 8 status values: queued, running, waiting_input, validation_failed, completed, failed, cancelled, detached
- `started_at` + `finished_at` → compute duration
- `pr_url` + `pr_status` → PR lifecycle tracking
- `model` field → group by model type
- Index: `(project_id, status)`

### captures table (schema.ts:64-76)
- 4 status values: pending, triaged, deferred, dismissed
- Index: `(project_id, status)`

### epics table (schema.ts:80-93)
- 6 ui_status values: blocked, ready, in_progress, in_review, done, cancelled
- Index: `(project_id)`

## 2. Server Patterns

### Route Pattern
- Factory function: `createXxxRouter({ db, ... }): RouterType`
- Router with `mergeParams: true`
- Middleware: `authenticate` → `requireProjectMember` → handler
- Zod `.safeParse()` for validation, return 400 with `parsed.error.issues`
- try/catch with `logError()` for 500s
- `emitToProject()` for Socket.IO events on mutations

### DB Access
- Import: `db` from `../db/index.js`, tables from `../db/schema.js`
- Drizzle ORM: `eq`, `and`, `desc`, `gt` from `drizzle-orm`
- `.all()` for arrays, `.get()` for single rows, `.run()` for mutations
- Timestamps: Unix seconds via `Math.floor(Date.now() / 1000)`

### Route Registration (index.ts:90-111)
- `app.use('/api/projects/:projectId/xxx', authenticate, requireProjectMember, createXxxRouter({ db }))`

## 3. Frontend Patterns

### Demo UI (ui/ directory)
- Static data files in `ui/src/data/` — no API calls
- Zustand stores for UI state
- Pages use `useMemo` for filtered data, `useState` for local state
- Lazy-loaded via React.lazy + Suspense

### Production Client (packages/client/)
- TanStack Query for server data
- API resources in `lib/resources.ts`
- Hooks in `hooks/` directory
- Socket.IO events invalidate query keys
- `@/` import alias configured

### Demo Activity Pages Already Created
- 4 variants in `ui/src/pages/activity-page-{split,stacked,tabbed,combined}.tsx`
- Data file: `ui/src/data/activity.ts`
- Layout switcher component at `ui/src/components/activity/layout-switcher.tsx`
- **User chose: Split view (45% feed / 55% metrics)**

## 4. Graph Page (Being Replaced)
- Files: `pages/graph-page.tsx`, `components/graph/{dependency-graph,graph-node,graph-controls,graph-legend}.tsx`, `hooks/use-graph.ts`
- Route: `/graph` in app shell
- Data: `lib/resources.ts` has `graphApi.get()` hitting `/api/projects/:projectId/graph`
- **Decision: Keep files, just unlink from nav/routing**

## 5. Gaps Identified
1. **Missing activity logging** — 4 of 8 action types not logged (session_completed, session_failed, pr_created, bead_status_changed)
2. **No activity read endpoint** — need new `GET /api/projects/:projectId/activity`
3. **No metrics endpoint** — need new `GET /api/projects/:projectId/metrics` with aggregations
4. **No activity page in production client** — only demo exists in ui/
5. **Production client needs**: page component, TanStack Query hook, route wiring, nav update
