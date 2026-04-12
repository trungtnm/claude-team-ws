# Discovery Report: Git Worktree Isolation + Pre/Post DAG Nodes

## Date: 2026-04-10
## Features: (1) Git Worktree Isolation per Session, (2) Pre/Post Bash Commands as DAG Nodes

---

## 1. Current Session Execution Architecture

### Session Runner (`packages/server/src/services/session-runner.ts`, 1504 lines)

**Key class:** `SessionRunner` (line 218) — singleton managing all active sessions

**ManagedSession interface (lines 45-64):**
- `targetDir: string` — working directory for agent (line 338: falls back to `this.projectRoot`)
- `abortController: AbortController` — cancellation mechanism
- `pendingAnswer` — promise-based Q&A resolution
- Token tracking: `inputTokens`, `outputTokens`, `toolCallCount`

**Lifecycle flow:**
1. Queue poll every 3s (`processQueue()`, line 286) checks concurrency limits
2. `startSession()` (line 320): creates ManagedSession, sets `targetDir = session.target_dir || this.projectRoot`
3. `runAgent()` (line 373): calls Agent SDK `query()` with `cwd: targetDir` (line 386)
4. Message loop processes events, stores in DB, emits via Socket.IO
5. Completion → status `idle` (not `completed` — user marks complete)

**target_dir touchpoints:**
- Validation in routes (sessions.ts:88-95): must be within `project.project_root`
- Schema field (schema.ts): `target_dir: text('target_dir')` nullable
- ManagedSession (line 338): `targetDir` field
- Agent SDK (line 386): `cwd: targetDir`
- Write/Edit policy (lines 772-791): checks file path starts with `managed.targetDir`

### Git Service (`packages/server/src/services/git-service.ts`, 80 lines)

**Available methods:**
- `clone(url, destPath, branch?)` — clone repo
- `pull(repoPath)` — pull + count commits
- `branches(repoPath)` — list all branches with ahead/behind
- `checkout(branchName, repoPath)` — switch branch
- `checkoutNewBranch(branchName, repoPath)` — create + switch
- `lastCommit(repoPath)` — HEAD info

**Pattern:** All use `execFile('git', args, { cwd, timeout: 30_000 })`
**Missing:** No worktree operations

### Session Cleanup (`packages/server/src/services/session-cleanup.ts`, 118 lines)

- Polls for idle sessions older than `IDLE_TTL_HOURS` (24h default)
- Auto-completes them with notification
- **No filesystem cleanup** — only deletes Claude history files on explicit `deleteSession()`

---

## 2. Database Schema

### Sessions Table (schema.ts:108-138)
Key columns: id, project_id, epic_id, user_id, name, claude_session_id, model, status, permission_mode, prompt, **target_dir** (nullable), pid, exit_code, pr_url, pr_status, input/output_tokens_used, tool_calls_used, started_at, finished_at, created_at

### Session Events Table (schema.ts:142-152)
- event_type enum: `['system', 'assistant', 'tool_use', 'tool_result', 'result', 'error']`
- data: JSON-serialized event payload

### Session Audit Log (schema.ts:250-260)
- tool_name, tool_input_summary, policy_result (allow/ask/block), user_decision

### Activity Log (schema.ts:225-246)
- action enum includes: session_started, session_completed, session_failed

### Drizzle Migration Pattern
- Config: `packages/server/drizzle.config.ts`
- 8 existing migrations (0000-0007)
- Workflow: `pnpm db:generate` → `pnpm db:migrate`

---

## 3. Frontend Session Creation

### New Session Dialog (`packages/client/src/components/agents/new-session-dialog.tsx`)
- Fields: Session Name, Prompt (RichInput), Repository picker (radio buttons), Model, Permission Mode
- `targetDir` set via repo picker (`repo.path`)
- Passed as `target_dir: targetDir.trim() || undefined`

### Session Hooks (`packages/client/src/hooks/use-sessions.ts`)
- 10 mutations: create, cancel, resume, answer, interrupt, complete, delete, bulkDelete, sendMessage, setPermissionMode
- TanStack Query with Socket.IO cache invalidation

### Client Types (`packages/client/src/types/index.ts:136-160`)
- `AgentSession` interface with `targetDir: string | null`

### Stream View (`packages/client/src/components/agents/agent-stream-view.tsx`)
- Renders events via `StreamEvent` component
- Event type dispatch: system, assistant, tool_use, tool_result, result, error

---

## 4. Testing Patterns

### Unit Tests (`packages/server/src/routes/sessions.test.ts`)
- Vitest + supertest, mock db/auth/socket-manager
- Tests request/response contract

### Integration Tests (`packages/server/src/routes/sessions.integration.test.ts`)
- Real SQLite test DB (`createTestDb()`)
- `insertSession()` helper for seeding
- Path traversal prevention tests for `target_dir` (lines 407-446)
- Session ownership checks

---

## 5. Existing Patterns Relevant to Workflow Engine

### NO existing workflow/pipeline/step infrastructure found

### Relevant patterns to reuse:
- **Command Policy Engine** (session-runner.ts:88-185): regex evaluation, cached compilation
- **Token/Rate Limiting** (lines 33-199): per-session tracking with warnings
- **Event push system** (lines 1037-1068): append-only events with Socket.IO broadcast
- **Audit logging** (lines 804-816): per-tool-call policy decisions
- **Q&A mechanism** (lines 878-950): promise-based user interaction via Socket.IO

### Epic-Session Relationship
- `sessions.epic_id` nullable FK
- Multiple sessions can share an epic
- No enforcement of one-session-per-epic at DB level

---

## 6. Key Observations for Planning

1. **target_dir is the only isolation mechanism** — no branch isolation, no worktree
2. **Write/Edit policy checks** use `managed.targetDir` as boundary — worktree path would serve same purpose
3. **Session cleanup does NOT clean filesystem** — worktree cleanup must be added
4. **Event type enum is fixed in schema** — adding new types requires migration
5. **Session runner is monolithic** (1504 lines) — workflow engine should wrap it, not modify internally
6. **Agent SDK `cwd` is the key integration point** — worktree path replaces target_dir here
7. **No pre/post execution hooks exist** — this is greenfield
8. **Socket.IO event patterns are well-established** — new workflow events should follow same pattern
