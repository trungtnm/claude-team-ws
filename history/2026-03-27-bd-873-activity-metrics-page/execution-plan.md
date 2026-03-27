# Execution Plan — Activity + Metrics Page (bd-873)

## Tracks

### Track 1: GreenForge (Backend)
**Agent:** Single backend worker
**File scope:** `packages/server/src/**`
**Beads (in order):**

1. **bd-873.1** — Add session_completed and session_failed activity_log inserts
   - Files: `packages/server/src/services/session-runner.ts`, `packages/server/src/routes/sessions.ts`
   - Estimated: 20 min
   - Entry point (no blockers)

2. **bd-873.2** — Create activity + metrics API routes
   - Files: `packages/server/src/routes/activity.ts` (new), `packages/server/src/index.ts`
   - Estimated: 45 min
   - Entry point (no blockers, can run parallel with bd-873.1)

3. **bd-873.3** — Write integration tests for activity + metrics endpoints
   - Files: `packages/server/src/routes/activity.integration.test.ts` (new)
   - Estimated: 30 min
   - Blocked by: bd-873.1, bd-873.2

### Track 2: BlueLake (Frontend)
**Agent:** Single frontend worker
**File scope:** `packages/client/src/**`
**Beads (in order):**

4. **bd-873.4** — Add Activity page to production client
   - Files: `packages/client/src/pages/activity-page.tsx` (new), `packages/client/src/hooks/use-activity.ts` (new), `packages/client/src/hooks/use-metrics.ts` (new), `packages/client/src/lib/resources.ts`, `packages/client/src/types/index.ts`
   - Estimated: 60 min
   - Blocked by: bd-873.2 (needs API endpoints to exist)

5. **bd-873.5** — Replace Graph nav/route with Activity
   - Files: `packages/client/src/components/layout/header.tsx`, `packages/client/src/components/app-shell.tsx`
   - Estimated: 10 min
   - Blocked by: bd-873.4

## Dependency Graph

```
bd-873.1 (inserts) ──────────┐
                              ├── bd-873.3 (tests)
bd-873.2 (API routes) ───────┤
                              └── bd-873.4 (frontend page) ── bd-873.5 (nav swap)
```

## Parallelization Strategy

**Phase A** (parallel):
- GreenForge starts bd-873.1 and bd-873.2 simultaneously (no dependency between them)

**Phase B** (after Phase A completes):
- GreenForge works on bd-873.3 (integration tests)
- BlueLake starts bd-873.4 (frontend page) — only needs bd-873.2 done

**Phase C** (after bd-873.4):
- BlueLake completes bd-873.5 (nav swap)

**Total estimated time:** ~2.5 hours sequential, ~1.5 hours with parallelization

## File Scope (No Overlap)

| Track | Scope | Exclusive? |
|-------|-------|------------|
| GreenForge | `packages/server/src/**` | Yes |
| BlueLake | `packages/client/src/**` | Yes |

No file overlap between tracks — safe for parallel execution.

## Verification

After all beads complete:
1. `pnpm test` — unit tests pass
2. `pnpm test:integration` — integration tests pass (including new activity tests)
3. `pnpm build` — production build succeeds
4. Manual: navigate to /activity, verify feed loads, metrics display, 30s polling works
5. Manual: verify /graph route returns 404 (unlinked) but graph files still exist on disk
