# Execution Plan — Phases 2-6

## Epic: ctw-25n (Foundation Fix) + ctw-2gj (Phase 2) + ctw-2g4 (Phase 3) + ctw-6hp (Phase 4) + ctw-2fm (Phase 5) + ctw-9j3 (Phase 6)

## Tracks

### Wave 1: Foundation Fix (prerequisite, sequential)

All agents blocked until this completes.

| Order | Bead | Title | Agent |
|:-----:|------|-------|-------|
| 1 | ctw-25n.1 | Fix client API types and paths | BlueLake |
| 2 | ctw-25n.2 | Fix socket client event names | BlueLake |

**Agent: BlueLake**
- File scope: `packages/client/src/lib/**`
- Duration: ~45min

---

### Wave 2: Phase 2 Backend + Phase 3 Spikes (parallel)

After Foundation Fix completes, these 4 tracks run simultaneously.

| Track | Bead(s) | Agent | File Scope |
|-------|---------|-------|------------|
| **A** | ctw-2gj.1, ctw-2gj.2 | GreenCastle | `packages/server/src/routes/captures.ts`, `packages/server/src/routes/epics.ts` |
| **B** | ctw-2g4.1 | RedStone | `.spikes/`, spike docs |
| **C** | ctw-2g4.2 | PurpleBear | `.spikes/`, spike docs |
| **D** | ctw-2gj.3 | SilverWolf | `packages/client/src/hooks/**`, `packages/client/src/lib/api.ts` (read-only) |

**Track A — GreenCastle**: Wire Socket.IO emits + BeadsService into captures/epics routes
**Track B — RedStone**: Spike Claude CLI stdin/stdout Q&A protocol
**Track C — PurpleBear**: Spike Crash recovery PID monitoring
**Track D — SilverWolf**: TanStack Query hooks for captures and epics

---

### Wave 3: Phase 2 Frontend + Phase 3 Backend Core (parallel)

After Wave 2 completes.

| Track | Bead(s) | Agent | File Scope |
|-------|---------|-------|------------|
| **E** | ctw-2gj.4, ctw-2gj.5 | BlueLake | `packages/client/src/components/capture/**`, `packages/client/src/components/kanban/epic-card.tsx` |
| **F** | ctw-2g4.3, ctw-2g4.4 | GreenCastle | `packages/server/src/services/agent-queue.ts`, `packages/server/src/services/context-builder.ts` |

---

### Wave 4: Phase 2 Frontend (Kanban) + Phase 3 Spawn Orchestration (parallel)

| Track | Bead(s) | Agent | File Scope |
|-------|---------|-------|------------|
| **G** | ctw-2gj.6, ctw-2gj.7, ctw-2gj.8 | BlueLake | `packages/client/src/components/kanban/**`, `packages/client/src/pages/board-page.tsx` |
| **H** | ctw-2g4.5, ctw-2g4.6 | GreenCastle | `packages/server/src/routes/sessions.ts`, `packages/server/src/services/agent-manager.ts` |

---

### Wave 5: Phase 3 Remaining (parallel)

| Track | Bead(s) | Agent | File Scope |
|-------|---------|-------|------------|
| **I** | ctw-2g4.7, ctw-2g4.8 | GreenCastle | `packages/server/src/services/agent-manager.ts`, `packages/server/src/services/question-handler.ts` |
| **J** | ctw-2g4.9, ctw-2g4.10, ctw-2g4.11 | BlueLake | `packages/client/src/components/agent/**`, `packages/client/src/pages/agents-page.tsx` |

---

### Wave 6: Phase 4 + Phase 5 + Phase 6 (maximum parallel)

After Phase 3 completes. All 3 phases can run simultaneously.

| Track | Phase | Bead(s) | Agent | File Scope |
|-------|-------|---------|-------|------------|
| **K** | P4 | ctw-6hp.1, ctw-6hp.2, ctw-6hp.3 | GreenCastle | `packages/server/src/services/validation-service.ts`, `packages/server/src/services/pr-service.ts` |
| **L** | P5 | ctw-2fm.1, ctw-2fm.2, ctw-2fm.3 | RedStone | `packages/server/src/routes/rules.ts`, `packages/server/src/routes/mail.ts`, `packages/server/src/routes/webhooks.ts` |
| **M** | P6 | ctw-9j3.1 | PurpleBear | `packages/server/src/routes/graph.ts` |

---

### Wave 7: Remaining Frontend (parallel)

| Track | Phase | Bead(s) | Agent | File Scope |
|-------|-------|---------|-------|------------|
| **N** | P4 | ctw-6hp.4, ctw-6hp.5, ctw-6hp.6 | BlueLake | `packages/server/src/routes/review.ts`, `packages/client/src/pages/review-page.tsx`, `packages/client/src/components/review/**` |
| **O** | P5 | ctw-2fm.4, ctw-2fm.5 | SilverWolf | `packages/client/src/components/rules/**`, `packages/client/src/components/mail/**` |
| **P** | P6 | ctw-9j3.2, ctw-9j3.3 | PurpleBear | `packages/client/src/components/graph/**`, `packages/client/src/pages/graph-page.tsx`, `ecosystem.config.cjs` |

---

## Agent Summary

| Agent | Primary Focus | File Scopes |
|-------|---------------|-------------|
| **BlueLake** | Frontend (client components + pages) | `packages/client/src/**` |
| **GreenCastle** | Backend (routes + services) | `packages/server/src/**` |
| **RedStone** | Spikes + Phase 5 backend | `.spikes/`, `packages/server/src/routes/{rules,mail,webhooks}.ts` |
| **PurpleBear** | Spikes + Phase 6 | `.spikes/`, `packages/server/src/routes/graph.ts`, `packages/client/src/components/graph/**` |
| **SilverWolf** | Hooks + Phase 5 frontend | `packages/client/src/hooks/**`, `packages/client/src/components/{rules,mail}/**` |

## Critical Path

```
Foundation Fix → Phase 2 Backend → Phase 3 (Queue+Context → Spawn → Events → Q&A) → Phase 4 Backend → Review Route
     ctw-25n       ctw-2gj.1-2       ctw-2g4.3-7                                       ctw-6hp.1-3      ctw-6hp.4
```

**Estimated critical path length**: ~8 agent sessions (6 sequential waves with ~2 sessions each on the critical path)

## Dependencies Verified

- 0 cycles in dependency graph
- 3 entry points (Foundation Fix epic + 2 tasks)
- 25 blocked beads (correct — all waiting on upstream deps)
- All frontend beads blocked by their backend counterparts
- All backend beads properly sequenced (schema → routes → services)
