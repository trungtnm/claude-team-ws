# Execution Plan — Full Implementation of claude-team-ws

**Date:** 2026-03-24
**Epic:** bd-1ac (Full Implementation — claude-team-ws production app)
**Total Beads:** 32 (1 epic + 31 tasks)
**Strategy:** Hybrid Foundation + Parallel Vertical Slices

---

## Phase 0: Foundation (Sequential — blocks all Phase 1 work)

Execute in this exact order. One agent, no parallelism.

| Order | Bead | Title | Priority | Est. |
|-------|------|-------|----------|------|
| 0.1 | bd-1w8 | Monorepo scaffolding — pnpm workspace + package configs | P0 | 1h |
| 0.2 | bd-1mk | Docker infrastructure — Agent Mail + CM containers + PM2 | P1 | 30m |
| 0.3 | bd-2f9 | Database schema + connection — 14 tables in Drizzle ORM | P0 | 2h |
| 0.4 | bd-3rz | Server middleware + Socket.IO + Express entry point | P0 | 2h |
| 0.5 | bd-21e | Client foundation — API client, Socket.IO, auth, router, shadcn/ui | P0 | 2h |

**After Phase 0:** 5 beads closed. Server starts, client renders login page.

---

## Phase 1: Parallel Vertical Slices (4 concurrent tracks)

### Track: BlueLake (Auth + Projects + Repos)
**Agent:** BlueLake
**File scope:** `packages/server/src/routes/{auth,projects,repos}.ts`, `packages/server/src/services/git-service.ts`, `packages/client/src/pages/settings-page.tsx`, `packages/client/src/components/settings/{project-tab,repos-tab,users-tab}.tsx`, `packages/client/src/hooks/{use-projects,use-repos}.ts`

| Order | Bead | Title | Priority | Blocked By |
|-------|------|-------|----------|------------|
| 1.1 | bd-17i | Auth routes — login, me, logout with JWT cookie | P1 | bd-2f9, bd-3rz |
| 1.2 | bd-15u | Projects routes — CRUD + project init flow | P1 | bd-2f9, bd-3rz |
| 1.3 | bd-3o6 | Repos routes + GitService — clone, link, pull, branches | P1 | bd-2f9, bd-3rz |
| 1.4 | bd-21x | Client — Project selector + settings (project/repos/users tabs) | P1 | bd-21e, bd-15u, bd-3o6 |

### Track: GreenCastle (Captures + Epics + Board)
**Agent:** GreenCastle
**File scope:** `packages/server/src/services/beads-service.ts`, `packages/server/src/routes/{captures,epics}.ts`, `packages/client/src/pages/{captures-page,board-page}.tsx`, `packages/client/src/components/{capture,board}/**`, `packages/client/src/hooks/{use-captures,use-epics}.ts`

| Order | Bead | Title | Priority | Blocked By |
|-------|------|-------|----------|------------|
| 2.1 | bd-215 | BeadsService — br CLI wrapper via execFile | P1 | bd-3rz |
| 2.2 | bd-2p8 | Captures routes — CRUD + triage auto-create epic | P1 | bd-2f9, bd-3rz, bd-215 |
| 2.3 | bd-3tt | Epics routes — CRUD + scope analysis + split proposal | P1 | bd-2f9, bd-3rz, bd-215 |
| 2.4 | bd-wa2 | Client — Captures page with real API + Socket.IO | P1 | bd-21e, bd-2p8 |
| 2.5 | bd-1uz | Client — Board page with real API + drag-and-drop | P1 | bd-21e, bd-3tt |

### Track: RedStone (Sessions + Agent Engine) — CRITICAL PATH
**Agent:** RedStone
**File scope:** `packages/server/src/services/{agent-service,agent-mail-client,cm-client,cass-service}.ts`, `packages/server/src/routes/sessions.ts`, `packages/client/src/pages/{agents-page,agent-stream-page}.tsx`, `packages/client/src/components/agents/**`, `packages/client/src/hooks/{use-sessions,use-session-stream}.ts`

| Order | Bead | Title | Priority | Blocked By |
|-------|------|-------|----------|------------|
| 3.1 | bd-2tj | Agent support services — AgentMailClient, CmClient, CassService | P1 | bd-3rz |
| 3.2 | bd-d4h | AgentService — core engine with Agent SDK, queue, crash recovery | P0 | bd-2f9, bd-3rz, bd-215 |
| 3.3 | bd-3lm | Sessions routes — create, cancel, resume, answer, events | P0 | bd-2f9, bd-3rz, bd-d4h |
| 3.4 | bd-2at | Client — Agents page with session list + Socket.IO | P0 | bd-21e, bd-3lm |
| 3.5 | bd-a6p | Client — Agent Stream page with real-time streaming + Q&A | P0 | bd-21e, bd-3lm, bd-2at |

**Note:** RedStone depends on GreenCastle's bd-215 (BeadsService) for context building. GreenCastle should prioritize bd-215 first.

### Track: PurpleBear (Settings + Notifications + Misc)
**Agent:** PurpleBear
**File scope:** `packages/server/src/routes/{rules,webhooks,notifications,mail}.ts`, `packages/server/src/services/{webhook-service,notification-service,activity-log-service}.ts`, `packages/client/src/components/settings/{rules-tab,webhooks-tab}.tsx`, `packages/client/src/hooks/{use-rules,use-webhooks,use-notifications}.ts`

| Order | Bead | Title | Priority | Blocked By |
|-------|------|-------|----------|------------|
| 4.1 | bd-3br | Rules routes — CRUD for knowledge rules | P2 | bd-2f9, bd-3rz |
| 4.2 | bd-hlt | Webhooks routes + WebhookService — Slack/Discord dispatch | P2 | bd-2f9, bd-3rz |
| 4.3 | bd-1iz | Notifications routes + service — list, mark-read, emit | P2 | bd-2f9, bd-3rz |
| 4.4 | bd-2mk | Mail proxy routes — Agent Mail thread viewer | P2 | bd-3rz, bd-2tj |
| 4.5 | bd-4k5 | Client — Settings (rules + webhooks tabs) | P2 | bd-21e, bd-3br, bd-hlt |
| 4.6 | bd-3ng | Client — Notifications dropdown with Socket.IO | P2 | bd-21e, bd-1iz |

---

## Phase 2: Integration (Sequential, after all Phase 1 slices)

| Order | Bead | Title | Priority | Blocked By |
|-------|------|-------|----------|------------|
| 5.1 | bd-13v | BvService + Graph routes — bv CLI wrapper + React Flow data | P1 | bd-3rz, bd-215 |
| 5.2 | bd-3ao | Client — Graph page with real bv data + dagre layout | P1 | bd-21e, bd-13v |
| 5.3 | bd-2tc | Reviews routes + GhService — PR review, merge flow, AI review | P1 | bd-2f9, bd-3rz, bd-3lm, bd-215 |
| 5.4 | bd-24h | Client — PR Review page with diff viewer + AI comments | P1 | bd-21e, bd-2tc |
| 5.5 | bd-1jq | Beads Sync routes — status, resume, force | P2 | bd-3rz, bd-215 |
| 5.6 | bd-3ki | Socket.IO real-time wiring + E2E tests | P1 | bd-21e, bd-1uz, bd-wa2, bd-2at |

---

## Cross-Track Dependencies

```
GreenCastle bd-215 (BeadsService) ──→ RedStone bd-d4h (AgentService needs BeadsService for context)
RedStone bd-3lm (Sessions routes) ──→ Phase 2 bd-2tc (Reviews routes need sessions)
RedStone bd-2tj (Agent support) ──→ PurpleBear bd-2mk (Mail proxy needs AgentMailClient)
```

**Mitigation:** GreenCastle should complete bd-215 early (first bead in their track). PurpleBear should start bd-2mk last since it depends on RedStone's bd-2tj.

---

## Execution Summary

| Phase | Beads | Parallel Agents | Critical Dependencies |
|-------|-------|-----------------|----------------------|
| Phase 0 | 5 | 1 | Sequential chain |
| Phase 1 | 20 | 4 (BlueLake, GreenCastle, RedStone, PurpleBear) | bd-215 cross-track dep |
| Phase 2 | 6 | 1-2 | After all Phase 1 |
| **Total** | **31 tasks** | | |

---

## Getting Started

```bash
# Claim the first bead
br update bd-1w8 --status in_progress

# After completing monorepo scaffolding
br close bd-1w8 --reason "Completed"
br sync --flush-only

# Then start Phase 0.2-0.5 in sequence
br update bd-1mk --status in_progress
# ...
```

## Orchestrator Notes

- Phase 0 is a single-agent sequential effort. Do not parallelize.
- Phase 1 tracks have NO overlapping file scopes. Safe for 4 concurrent agents.
- RedStone (Sessions + Agent Engine) is the CRITICAL PATH. Prioritize unblocking it.
- If an agent finishes their track early, they can pick up Phase 2 beads.
- All agents should use Agent Mail for coordination if working concurrently.
