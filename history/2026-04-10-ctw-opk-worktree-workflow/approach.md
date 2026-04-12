# Approach: Git Worktree Isolation + Pre/Post DAG Nodes

## Date: 2026-04-10

---

## Gap Analysis Summary

### Feature 1: Git Worktree Isolation
| Have | Need | Gap |
|------|------|-----|
| GitService with clone/pull/branches/checkout (80 LOC) | worktree add/remove/list/prune methods | ~80 LOC new |
| `target_dir` nullable text on sessions | `worktree_path`, `worktree_branch` columns | Migration 0008 |
| Write/Edit policy checks `managed.targetDir` | Worktree path replaces targetDir transparently | ~0 LOC (natural) |
| Session cleanup auto-completes idle sessions | Worktree removal + orphan pruning | ~40 LOC |
| No epic uniqueness enforcement | One active worktree per epic | ~20 LOC |
| No merge strategy | Decision needed: leave branch / auto-push / auto-PR | Product decision |

### Feature 2: Pre/Post Bash Commands as DAG Nodes
| Have | Need | Gap |
|------|------|-----|
| Single `runAgent()` execution path | DAG executor wrapping prompt node with bash nodes | ~200 LOC new |
| No workflow types | WorkflowNode type with id, type, config, dependsOn, status | ~60 LOC new |
| Fixed event_type enum (6 types) | step_start, step_complete, step_error events | Use `system` subtype |
| Session runner calls `query()` directly | Extract `executePromptNode()`, callable from executor | ~50 LOC refactor |

---

## Recommended Approaches

### Feature 1: Worktree as Transparent targetDir Override

**Rationale**: The existing `targetDir` mechanism is well-factored. Every place that needs the working directory reads `managed.targetDir`. Worktree creation sets this value transparently — policy engine, cwd config, resume logic all work unchanged.

**Flow:**
```
Session created → startSession() → resolve repo path from epic/project
  → git worktree add <worktree-path> -b agent/{epicSlug}/{sessionId} <repo-path>
  → set managed.targetDir = worktree-path
  → set DB: worktree_path, worktree_branch
  → runAgent() uses cwd: managed.targetDir (unchanged)
  → on complete/delete: git worktree remove <worktree-path>
```

**Files modified:**
- `git-service.ts` — add worktreeAdd, worktreeRemove, worktreeList, worktreePrune (~80 LOC)
- `schema.ts` — add worktree_path, worktree_branch to sessions (~5 LOC)
- `drizzle/migrations/0008_*.sql` — ALTER TABLE (~3 LOC)
- `session-runner.ts` — worktree create in startSession, cleanup in complete/delete (~80 LOC)
- `session-cleanup.ts` — worktree removal on auto-complete, periodic prune (~40 LOC)
- `sessions.ts` (route) — epic uniqueness check (~20 LOC)

### Feature 2: Sequential DAG with Node Types

**Rationale**: Hooks (pre/post arrays) would be rewritten when DAG evolves. Full DAG engine is over-engineered. Sequential DAG gives the right abstraction — a node with type, config, status, duration — without parallel execution or variables.

**Flow:**
```
Session created with pre_commands/post_commands
  → Route transforms to workflow_nodes JSON:
    [
      { id: "pre-1", type: "bash", config: { command: "pnpm test" } },
      { id: "prompt", type: "prompt", config: {} },
      { id: "post-1", type: "bash", config: { command: "pnpm test" } }
    ]
  → startSession() detects workflow_nodes, delegates to WorkflowExecutor
  → WorkflowExecutor runs nodes sequentially:
    → bash node: execFile('bash', ['-c', cmd]) → push step_start/step_complete events
    → prompt node: call executePromptNode() (extracted from runAgent)
    → bash node: same
  → Each step tracked with duration, exit code, output
```

**New files:**
- `workflow-types.ts` — WorkflowNode, WorkflowStepResult (~60 LOC)
- `workflow-executor.ts` — sequential runner (~200 LOC)
- `drizzle/migrations/0009_*.sql` — workflow_nodes column (~5 LOC)

**Modified files:**
- `schema.ts` — add `workflow_nodes TEXT` to sessions (~5 LOC)
- `session-runner.ts` — check for workflow_nodes, delegate to executor, extract executePromptNode (~80 LOC)
- `sessions.ts` (route) — accept pre_commands/post_commands, transform to nodes (~30 LOC)
- Client: step progress display (~100 LOC)

---

## Risk Assessment

| Component | Risk | Reasoning |
|-----------|------|-----------|
| GitService worktree methods | LOW | Direct CLI wrappers, git worktrees stable since 2.5 |
| Schema migrations | LOW | Nullable ALTER TABLE ADD COLUMN on SQLite |
| Session runner worktree integration | MEDIUM | 1500-line file, multiple lifecycle paths need awareness |
| Worktree cleanup + orphans | MEDIUM | Edge cases: removal fails, partially-created worktrees |
| One-worktree-per-epic enforcement | LOW | Simple DB query |
| Merge strategy for completed worktrees | HIGH | Product decision needed — leave branch vs auto-push vs auto-PR |
| Bash step execution | LOW | execFile pattern used throughout codebase |
| Prompt node extraction from runAgent | MEDIUM | ManagedSession lifecycle entanglement |
| Step observability | LOW | Follows existing event push pattern |
| Error propagation across steps | MEDIUM | Pre-command failure semantics need definition |
| Backwards compatibility | LOW | Sessions without workflow_nodes behave exactly as today |

---

## Implementation Order

### Phase 1: Git Worktree (build first — safety-critical)
1. GitService worktree methods + unit tests
2. Schema migration (worktree_path, worktree_branch)
3. Session runner integration (create on start, cleanup on complete/delete)
4. Session cleanup worktree removal + periodic prune
5. Epic uniqueness constraint
6. Integration tests

### Phase 2: Workflow DAG (build second — depends on worktree stability)
1. WorkflowNode types
2. WorkflowExecutor (bash-node first, test in isolation)
3. Schema migration (workflow_nodes column)
4. Extract executePromptNode() from session-runner
5. Integrate executor into startSession flow
6. Session route accepts pre/post commands, transforms to nodes
7. Client step progress display
8. Integration tests

---

## Open Product Questions

1. **Worktree merge strategy**: When session completes, should the branch be (a) left for manual PR, (b) auto-pushed, or (c) auto-PR via `gh`?
2. **Epic uniqueness**: Strict (one active session per epic) or soft (warning for additional)?
3. **Pre-command failure**: Session goes to `failed` or `validation_failed`? Retry option?
4. **API surface**: Literal `pre_commands`/`post_commands` arrays or full DAG definition from start?

---

## Estimated Effort

| Scope | Production LOC | Test LOC | Files |
|-------|---------------|----------|-------|
| Worktree isolation | ~230 | ~150 | 6 modified |
| DAG nodes | ~400 | ~200 | 3 new + 4 modified |
| **Total** | **~630** | **~350** | **3 new + 7 modified** |
