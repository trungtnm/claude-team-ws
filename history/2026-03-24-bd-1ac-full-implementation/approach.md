# Approach — Full Implementation of claude-team-ws

**Date:** 2026-03-24
**Selected Approach:** Hybrid Foundation + Parallel Vertical Slices (Approach C)

---

## Recommended Strategy

Build the shared foundation first (Phase 0), then fan out into 4 parallel vertical slices (Phase 1), then integrate (Phase 2).

### Why This Approach
1. **Sessions/Agent lifecycle is the critical path** (~30% of server effort, most unknowns). Starting early maximizes time for iteration.
2. **Foundation is well-specified** — exact package.json contents, column definitions, Docker configs in docs/. No ambiguity.
3. **ui/ demo de-risks client work** — all 75 files exist with correct visual design. Transformation is mechanical.
4. **Natural parallelism** — 4 slices can run concurrently after foundation is built.

---

## Risk Map

### HIGH Risk (need careful implementation)
- **AgentService** — Port playground SessionManager to production with DB persistence, queue, crash recovery
- **Sessions routes** — 12-phase lifecycle, complex state machine
- **Reviews routes** — gh CLI integration, AI review generation, merge flow
- **Repos routes** — git clone can fail many ways, concurrent access
- **GitService** — Many subcommands with different error modes
- **Epics routes** — Merges app DB + br show data, AI scope analysis
- **Agent Stream page (client)** — Real-time streaming, tool rendering, Q&A

### MEDIUM Risk (patterns exist, moderate complexity)
- DB Schema — 14 tables with relationships (Drizzle SQLite quirks)
- Auth middleware — Dual auth is standard but has edge cases
- BeadsService — br CLI wrapper, JSON parsing
- Socket.IO server — Many event types but well-documented
- Component port from ui/ — Data shape mismatches between mock and API
- TanStack Query hooks — Invalidation patterns, optimistic updates
- Socket.IO client — Query invalidation per event type
- Route restructuring — Flat → nested /projects/:projectId/*

### LOW Risk (standard patterns, well-documented)
- Monorepo config, Docker, package.json files
- Simple CRUD routes (rules, webhooks, notifications)
- shadcn/ui component copy
- Zustand stores (UI state only)
- Test infrastructure

---

## Decisions Made

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Route nesting | `/projects/:projectId/*` | API is project-scoped; needed for multi-project support |
| 2 | File upload | Defer to Phase 2 | Text captures work fine for MVP |
| 3 | AI scope analysis | Lightweight Claude API call | Not a full agent session — synchronous request |
| 4 | AI PR review | Claude API call on diff | Triggered when PR created |
| 5 | Telegram webhook | Remove from UI | Keep slack/discord per schema |
| 6 | PR review route param | Use :sessionId | Session has pr_url with PR number |
| 7 | User management | Add project_members CRUD | Settings users tab needs it |
| 8 | Event storage | Store all events | Valuable for debugging; 90-day cleanup |
| 9 | Auth token | HttpOnly cookie | Per API spec, no localStorage |
| 10 | Agent SDK model | Pass model aliases directly | Test first, add map if needed |
| 11 | Multi-repo epics | Use additionalDirectories | Agent SDK supports multiple dirs |
| 12 | Seed data | seedAdmin() on startup | From .env vars if users table empty |

---

## Critical Path

```
Phase 0 (Foundation) — Sequential, blocks everything
  └── Monorepo + packages + deps + schema + middleware + Socket.IO + client scaffold

Phase 1 (Parallel Slices) — 4 concurrent tracks
  ├── Slice A: Auth + Projects + Repos + Settings (project/repos/users tabs)
  ├── Slice B: Captures + Epics + Board (BeadsService, captures triage, board page)
  ├── Slice C: Sessions + Agent Engine (AgentService, queue, streaming, agents page) ← CRITICAL PATH
  └── Slice D: Settings (rules/webhooks) + Notifications + Mail proxy

Phase 2 (Integration) — Sequential, after all slices
  └── Graph + Reviews + Beads Sync + Socket.IO wiring + E2E tests + hardening
```

---

## Spike Requirements

### HIGH Risk Items Requiring Verification
None identified that need pre-implementation spikes. The Agent SDK integration is HIGH risk but we have a working reference implementation in `playgrounds/agents/`. The port to production is complex but not unknown.

### Rationale for Skipping Spikes
- Agent SDK: Working reference exists in `playgrounds/agents/server/session-manager.ts` (629 lines)
- Drizzle SQLite: Schema patterns from prior implementation at git commit `b1abceb`
- br/bv/cass CLI wrappers: Prior implementations exist in git history
- Socket.IO: Working reference in playground
- TanStack Query + Socket.IO: Working reference in playground client
