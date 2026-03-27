# Approach — Activity + Metrics Page

## Strategy: "Adapt the Demo, Wire to Real Data"

Use the demo `activity-page-split.tsx` as visual spec. Rebuild in production client with TanStack Query, typed API resources, and proper hooks. Do NOT copy-paste demo directly.

## Gap Analysis

### Backend Gaps
| Gap | Action |
|-----|--------|
| No SELECT queries on activity_log | Create `GET /api/projects/:projectId/activity` — paginated, joined with user name |
| No metrics endpoint | Create `GET /api/projects/:projectId/metrics` — aggregated counts from sessions/captures/epics |
| session_completed not logged | Add insert to session-runner.ts (~line 199) and sessions.ts (~line 303) |
| session_failed not logged | Add insert to session-runner.ts (~line 221) |
| pr_created not logged | **DEFERRED** — trigger point unclear |
| bead_status_changed not logged | **DEFERRED** — blast radius too wide (5+ files) |
| Route registration | Add 1-2 app.use() lines in index.ts |

### Frontend Gaps
| Gap | Action |
|-----|--------|
| No activity page | Create `pages/activity-page.tsx` from demo spec |
| No API resources | Add `activityApi` + `metricsApi` to `lib/resources.ts` |
| No hooks | Create `hooks/use-activity.ts` + `hooks/use-metrics.ts` (TanStack Query, 30s poll) |
| No types | Add `ActivityEntry` + `ProjectMetrics` to `types/index.ts` |
| Graph in nav/routes | Replace with Activity in `header.tsx` + `app-shell.tsx` |

## Key Decisions

1. **Activity inserts**: Add session_completed + session_failed (3 locations, 2 files). Defer pr_created and bead_status_changed.
2. **Metrics computation**: Drizzle ORM with `sql` template literals for COUNT/AVG. No raw SQL strings.
3. **Frontend**: Rewrite from demo reference — use TanStack Query hooks, not static data imports. Lift presentational components (MetricCard, StatusBar, actionConfig, timeAgo) nearly verbatim.
4. **Activity API**: Join user name server-side (cleaner for the feed, single JOIN on users table).
5. **Token usage / cost metrics**: Defer — session table doesn't store cumulative token counts. Show N/A or omit in v1.
6. **Router structure**: One combined router file `routes/activity.ts` with both `/activity` and `/metrics` sub-endpoints.

## Risk Assessment

| Component | Risk | Notes |
|-----------|------|-------|
| Activity API endpoint | LOW | Follows captures.ts pattern exactly |
| Metrics API endpoint | LOW | Single-table aggregations, indexes exist |
| Session activity inserts | MEDIUM | Touches session-runner.ts (critical service), but contained (3 locations) |
| Frontend page | LOW | Demo provides complete visual spec, 6+ existing pages as templates |
| Nav/routing changes | LOW | 4 lines changed across 2 files |
| Graph unlinking | LOW | Remove import + route, keep files |

## Implementation Order

1. Backend: Add activity_log inserts for session_completed/failed
2. Backend: Create activity + metrics routes
3. Backend: Register routes + integration tests
4. Frontend: Types + API resources + hooks
5. Frontend: Activity page component
6. Frontend: Nav/routing swap (graph → activity)
