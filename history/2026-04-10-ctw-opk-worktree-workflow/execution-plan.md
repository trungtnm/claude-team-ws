# Execution Plan: Git Worktree Isolation + Workflow DAG Nodes

**Epic:** ctw-opk
**Date:** 2026-04-10
**Estimated LOC:** ~630 production + ~350 tests

---

## Dependency Graph

```
                    ┌─ ctw-opk.1 (GitService methods)
                    │
                    ├─ ctw-opk.2 (Schema: worktree cols) ─── ctw-opk.5 (Settings UI)
                    │       │
  Entry points ─────┤       ▼
                    │  ctw-opk.3 (SessionRunner worktree) ─── ctw-opk.4 (Cleanup)
                    │       │
                    │       ▼
                    │  ctw-opk.6 (WorkflowExecutor) ─── ctw-opk.8 (Extract promptNode)
                    │                                          │
                    └─ ctw-opk.7 (Schema: workflow cols) ──────┤
                                                               ▼
                                                         ctw-opk.9 (Wire executor)
                                                               │
                                                               ▼
                                                         ctw-opk.10 (Client UI)
                                                               │
                                                               ▼
                                                         ctw-opk.11 (Integration tests)
```

## Execution Tracks

### Track A: "BlueLake" — Worktree Foundation (backend)
**File scope:** `packages/server/src/services/git-service.ts`, `packages/server/src/db/schema.ts`, `packages/server/drizzle/`, `packages/server/src/services/session-runner.ts`, `packages/server/src/services/session-cleanup.ts`

| Order | Bead | Title | Est. LOC | Blocked by |
|-------|------|-------|----------|------------|
| 1 | ctw-opk.1 | Add git worktree methods to GitService | ~80 | - |
| 2 | ctw-opk.2 | Schema migration: worktree + merge strategy | ~15 | - |
| 3 | ctw-opk.3 | Integrate worktree lifecycle into SessionRunner | ~80 | .1, .2 |
| 4 | ctw-opk.4 | Add worktree cleanup to session-cleanup | ~40 | .3 |

### Track B: "GreenCastle" — Workflow Engine (backend)
**File scope:** `packages/server/src/services/workflow-types.ts` (new), `packages/server/src/services/workflow-executor.ts` (new), `packages/server/src/routes/sessions.ts`

| Order | Bead | Title | Est. LOC | Blocked by |
|-------|------|-------|----------|------------|
| 1 | ctw-opk.7 | Schema migration: workflow_nodes column | ~10 | - |
| 2 | ctw-opk.6 | WorkflowNode types + WorkflowExecutor | ~260 | ctw-opk.3 (Track A) |
| 3 | ctw-opk.8 | Extract executePromptNode from runAgent | ~80 | .6 |
| 4 | ctw-opk.9 | Wire executor into session creation flow | ~30 | .7, .8 |

### Track C: "RedStone" — Frontend (frontend)
**File scope:** `packages/client/src/components/agents/`, `packages/client/src/components/settings/`, `packages/client/src/types/`, `packages/client/src/hooks/`

| Order | Bead | Title | Est. LOC | Blocked by |
|-------|------|-------|----------|------------|
| 1 | ctw-opk.5 | Merge strategy in project settings UI | ~40 | ctw-opk.2 (Track A) |
| 2 | ctw-opk.10 | Step progress display in stream view | ~100 | ctw-opk.9 (Track B) |

### Track D: "PurpleBear" — Validation (testing)
**File scope:** `packages/server/src/routes/sessions.integration.test.ts`

| Order | Bead | Title | Est. LOC | Blocked by |
|-------|------|-------|----------|------------|
| 1 | ctw-opk.11 | Integration tests for both features | ~200 | ctw-opk.4, ctw-opk.9 |

---

## Parallelism

```
Time ──────────────────────────────────────────────────►

Track A:  [.1 GitService] [.2 Schema] [.3 SessionRunner] [.4 Cleanup]
Track B:                  [.7 Schema] ----wait .3----  [.6 Executor] [.8 Extract] [.9 Wire]
Track C:                  -------wait .2--------  [.5 Settings UI]  ---wait .9--- [.10 Stream]
Track D:                  ---------------------------------wait .4 & .9----------- [.11 Tests]
```

**Critical path:** .1 → .3 → .6 → .8 → .9 → .10 → .11 (7 steps)
**Max parallelism:** 2 tracks at start (.1+.7 can run concurrently with .2)

---

## Product Decisions (Resolved)

| Question | Decision |
|----------|----------|
| Worktree merge strategy | Configurable per-project in Settings: leave / auto-push / auto-PR (default: leave) |
| Epic uniqueness | One active worktree per epic (strict) |
| Pre-command failure | Pause and ask user via existing Q&A mechanism |
| API surface | Simple `pre_commands`/`post_commands` arrays, transformed internally to DAG nodes |

---

## Key Implementation Notes

### Worktree Integration Points in session-runner.ts
- **Line 326**: `targetDir = session.target_dir || this.projectRoot` → becomes worktree path
- **Line 386**: `cwd: targetDir` → naturally picks up worktree path
- **Lines 772-791**: Write/Edit policy → works unchanged with worktree path
- **Line 1083**: Cancel → add worktree removal
- **Line 1306**: Delete → add worktree removal

### WorkflowExecutor Design
- Wraps SessionRunner, does not modify it internally
- Calls extracted `executePromptNode()` for prompt-type nodes
- Uses existing `pushEvent()` for step_start/step_complete events (system event type with structured data)
- Reuses existing abort signal for cancellation
- On bash failure: emits `session:question` event, waits for user answer via existing Q&A mechanism

### Backwards Compatibility
- Sessions without `workflow_nodes` behave exactly as today
- Sessions without `worktree_path` use `target_dir` as before
- No breaking API changes — `pre_commands`/`post_commands` are optional additions

---

## Verification

After Track A (worktree):
- Create two sessions on same epic → verify second is rejected (uniqueness)
- Create session → verify worktree branch exists at `agent/{epicSlug}/{sessionId}`
- Complete session → verify worktree removed and branch follows merge strategy
- Kill server during session → restart → verify orphaned worktrees are pruned

After Track B (workflow):
- Create session with `pre_commands: ["pnpm test"]` → verify tests run before agent starts
- Create session with pre-command that exits 1 → verify Q&A prompt appears
- Create session with `post_commands: ["pnpm lint"]` → verify lint runs after agent completes
- Create session without pre/post → verify legacy behavior unchanged

After Track C (frontend):
- Settings page shows merge strategy dropdown → change setting → verify persisted
- Session with workflow steps → verify step progress renders in stream view

After Track D (tests):
- `pnpm test:integration` passes with all new test cases
