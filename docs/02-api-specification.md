# API Specification — claude-team-ws

## Base URL

```
http://localhost:3000/api
```

## Authentication

All routes (except `/api/auth/login`) require header:
```
Authorization: Bearer <api_key>
```
or session cookie (set after login).

---

## Auth

### POST /api/auth/login
Login with API key, returns session cookie.

```json
// Request
{ "api_key": "ctw_abc123..." }

// Response 200
{ "user": { "id": "...", "name": "Trung", "role": "pm", "email": "..." } }
// Set-Cookie: ctw_session=<jwt>; HttpOnly; Secure; SameSite=Strict
```

### GET /api/auth/me
Current user info.

### POST /api/auth/logout
Clear session cookie.

---

## Projects

### GET /api/projects
List projects the user has access to.

```json
// Response 200
{ "projects": [{ "id": "...", "name": "MyApp", "slug": "myapp", "repos": [...], "max_concurrent_agents": 3 }] }
```

### POST /api/projects
*Requires: PM or TechLead*

Create a new project. Server auto-initializes umbrella repo + `.beads/` if not already present.

```json
// Request
{ "name": "MyApp", "slug": "myapp" }

// Response 201
{
  "project": {
    "id": "...",
    "name": "MyApp",
    "slug": "myapp",
    "project_root": "/data/projects/myapp",
    "repos": [],
    "max_concurrent_agents": 3
  }
}
```

**Server-side flow:**
1. Create directory: `/data/projects/myapp/`
2. `git init` (umbrella repo)
3. Create `.gitignore` (ignore beads.db, .ccu/, data/)
4. `br init` → creates `.beads/`
5. `mkdir repos/`
6. Initial commit: `git add . && git commit -m "Init project"`
7. Insert into `projects` table

### GET /api/projects/:projectId
Project details + stats summary + repos list.

### PATCH /api/projects/:projectId
Update settings (max_concurrent_agents, ask_question_mode).

---

## Repos Management

### GET /api/projects/:projectId/repos
List repos in the project.

```json
// Response 200
{
  "repos": [
    {
      "name": "backend",
      "path": "/data/projects/myapp/repos/backend",
      "git_url": "git@github.com:team/backend.git",
      "default_branch": "main",
      "current_branch": "main",
      "status": "clean",
      "last_commit": { "hash": "abc123", "message": "...", "date": "..." }
    }
  ]
}
```

### POST /api/projects/:projectId/repos
*Requires: PM or TechLead*

Add a repo to the project. Supports 2 modes: clone from URL or link an existing repo on the host.

**Mode 1: Clone from URL**

```json
// Request
{
  "mode": "clone",
  "name": "backend",
  "git_url": "git@github.com:team/backend.git",
  "default_branch": "main"
}

// Response 201
{
  "repo": {
    "name": "backend",
    "path": "/data/projects/myapp/repos/backend",
    "git_url": "git@github.com:team/backend.git",
    "default_branch": "main",
    "status": "ready"
  }
}
```

**Server-side flow:**
1. Validate: `repos/backend/` does not already exist
2. `git clone <git_url> repos/backend/`
3. Verify: `git -C repos/backend/ rev-parse --is-inside-work-tree`
4. Detect default branch if not specified: `git -C repos/backend/ remote show origin | grep 'HEAD branch'`
5. Update project record: append to `repos` JSON array
6. Socket.IO emit `repo:added` to project room

**Mode 2: Link an already-cloned repo on the host**

If the repo already exists somewhere on the Mac Mini, copy/symlink it into `repos/`.

```json
// Request
{
  "mode": "link",
  "name": "backend",
  "source_path": "/Users/dev/existing-backend-repo",
  "default_branch": "main"
}

// Response 201 (same format)
```

**Server-side flow:**
1. Validate: `source_path` is a git repo (`git rev-parse --is-inside-work-tree`)
2. Validate: `source_path` is not inside the project root (to avoid circular references)
3. Symlink: `ln -s /Users/dev/existing-backend-repo repos/backend`
   — or `cp -r` if an isolated copy is needed (configurable)
4. Verify remote: `git -C repos/backend/ remote -v`
5. Update project record

**Error cases:**
- Git URL invalid or auth failure → 400 + error message
- Directory already exists → 409 Conflict
- Source path is not a git repo → 400
- Disk space insufficient → 507

### DELETE /api/projects/:projectId/repos/:repoName
*Requires: PM or TechLead*

Remove a repo from the project.

```json
// Request (confirmation required)
{ "confirm": true }
```

**Server-side flow:**
1. Check: no Epic is currently `in_progress` targeting this repo
2. Check: no active agent session on the repo
3. If symlink → only remove the symlink (`unlink repos/backend`)
4. If cloned → remove the directory (`rm -rf repos/backend`)
5. Update project record: remove from `repos` JSON array
6. Socket.IO emit `repo:removed`

### POST /api/projects/:projectId/repos/:repoName/pull
*Requires: PM, Dev, or TechLead*

Manually pull the latest changes for a single repo.

```json
// Response 200
{ "result": "fast-forward", "new_commits": 3, "head": "abc123" }
```

### GET /api/projects/:projectId/repos/:repoName/branches
List branches for a single repo.

```json
// Response 200
{
  "branches": [
    { "name": "main", "is_default": true, "ahead": 0, "behind": 0 },
    { "name": "epic/auth-refactor", "is_default": false, "ahead": 5, "behind": 0 }
  ]
}
```

---

## Project Members

### GET /api/projects/:projectId/members
List project members with their roles.

```json
// Response 200
{
  "members": [
    { "user_id": "...", "name": "Trung", "email": "trung@...", "role": "techlead", "role_override": null, "created_at": 1711152000 }
  ]
}
```

### POST /api/projects/:projectId/members
*Requires: PM or TechLead*

Add a user to the project.

```json
// Request
{ "user_id": "...", "role_override": "dev" }

// Response 201
{ "member": { "user_id": "...", "role_override": "dev", "created_at": 1711152000 } }
```

Side effect: emit `member:added` to project room.

### PATCH /api/projects/:projectId/members/:userId
*Requires: PM or TechLead*

Update a member's project-level role override.

```json
// Request
{ "role_override": "techlead" }

// Response 200
{ "member": { "user_id": "...", "role_override": "techlead" } }
```

### DELETE /api/projects/:projectId/members/:userId
*Requires: PM or TechLead*

Remove a member from the project.

---

## Agent Queue

### GET /api/projects/:projectId/agent-queue
List queued agent sessions for a project. Ordered by priority (ASC) then position (ASC).

```json
// Response 200
{
  "queue": [
    { "id": "...", "epic_id": "...", "epic_title": "...", "user": { "id": "...", "name": "..." }, "priority": 1, "position": 1, "model": "sonnet", "status": "queued", "created_at": 1711152000 }
  ]
}
```

### DELETE /api/projects/:projectId/agent-queue/:queueId
*Requires: PM or TechLead*

Cancel a queued session.

Side effect: emit `queue:updated` to project room.

---

## Captures

### GET /api/projects/:projectId/captures
List captures. Query params: `status=pending|triaged|deferred`, `limit`, `offset`.

### POST /api/projects/:projectId/captures
*Requires: PM, Dev, or TechLead*

```json
// Request
{ "text": "Need to add rate limiting for API endpoints" }

// Response 201
{ "capture": { "id": "...", "text": "...", "status": "pending", "user": { "name": "Trung" }, "created_at": 1711152000 } }
```
**Side effect**: Socket.IO emit `capture:created` to project room.

### PATCH /api/projects/:projectId/captures/:captureId
Update capture status (triage). *Requires: PM or TechLead*

```json
// Request (triage → epic)
{ "status": "triaged", "triage_result": { "type": "epic", "title": "Rate Limiting", "description": "...", "priority": 1 } }
```
**Side effect**: If `type=epic` → auto-create Epic via `br create --type epic`.

### DELETE /api/projects/:projectId/captures/:captureId
Dismiss capture. *Requires: PM or TechLead*

---

## Epics

### GET /api/projects/:projectId/epics
List epics. Query params: `ui_status`, `limit`, `offset`.

Each epic returns merged data from the app DB + `br show <bead_epic_id> --json`:
```json
{
  "epics": [{
    "id": "...",
    "bead_epic_id": "bd-42",
    "ui_status": "ready",
    "git_branches": [{ "repo": "backend", "branch": "epic/rate-limiting" }],
    "bead": {
      "title": "Rate Limiting",
      "description": "...",
      "priority": 1,
      "status": "open",
      "labels": ["backend"],
      "children": [{ "id": "bd-43", "title": "Middleware setup", "status": "open" }]
    },
    "active_session": null,
    "pr_url": null
  }]
}
```

### GET /api/projects/:projectId/epics/:epicId
Epic detail + nested beads + sessions history + PR status.

### POST /api/projects/:projectId/epics
*Requires: PM or TechLead*

```json
// Request
{ "title": "Rate Limiting", "description": "...", "priority": 1, "labels": ["backend"], "repos": ["backend"] }
```
**Side effects**:
1. `br create --type epic --title "..." --priority 1 --json`
2. Insert into `epics` table
3. Socket.IO emit `epic:created`

### PATCH /api/projects/:projectId/epics/:epicId
Update Epic. Proxies updates to `br update` + app DB.

### POST /api/projects/:projectId/epics/:epicId/analyze-scope
*Requires: PM or TechLead*

Auto-detect scope and return a split proposal.

```json
// Response 200
{
  "analysis": {
    "estimated_tokens": 45000,
    "files_affected": 12,
    "complexity": "high",
    "recommendation": "split",
    "proposed_beads": [
      { "title": "Setup rate limiter middleware", "priority": 1, "files": ["src/middleware/rate-limit.ts"] },
      { "title": "Add Redis backend for rate limiting", "priority": 1, "files": ["src/lib/redis.ts", "docker-compose.yml"] },
      { "title": "Integration tests for rate limiting", "priority": 2, "files": ["tests/rate-limit.test.ts"] }
    ]
  }
}
```

### POST /api/projects/:projectId/epics/:epicId/confirm-split
*Requires: PM or TechLead*

PM confirms/edits the split proposal and creates Beads.

```json
// Request
{ "beads": [{ "title": "...", "priority": 1, "description": "..." }, ...] }
```
**Side effects**:
1. `br create` for each bead, link dependency to epic
2. `br dep add <bead-id> <epic-id>` for each bead

---

## Sessions (Agent Management)

### GET /api/projects/:projectId/sessions
List sessions. Query params: `status`, `epic_id`, `limit`, `offset`.

### POST /api/projects/:projectId/sessions
**Start Agent Session.** *Requires: PM, Dev, or TechLead*

```json
// Request
{ "epic_id": "...", "model": "sonnet", "prompt_override": null }
```

**Server-side flow (12 steps)**:
1. Check concurrency limit → queue if full
2. Scope gate (if not yet analyzed)
3. `git checkout -b epic/<slug>` in target repo(s)
4. Agent Mail: `register_agent(...)`
5. CM: `cm_context(...)` → rules
6. CASS: `cass search --robot "..."` → learnings
7. Compose prompt: Epic desc + AC + CM rules + CASS learnings
8. Spawn `claude -p --output-format=stream-json ...`
9. Store PID, update status → `running`
10. Socket.IO: join room `session:<id>`, start streaming

```json
// Response 201
{ "session": { "id": "...", "status": "running", "agent_mail_name": "BlueLake" } }
// or
{ "session": { "id": "...", "status": "queued", "queue_position": 2 } }
```

### GET /api/sessions/:sessionId
Session detail + event count + last event preview.

### POST /api/sessions/:sessionId/cancel
*Requires: Session owner, PM, or TechLead*

SIGTERM → 5s → SIGKILL. Update status → `cancelled`.

### POST /api/sessions/:sessionId/resume
Resume a completed/failed session.

```json
// Request
{ "prompt": "Fix the failing test in auth.test.ts" }
```

### POST /api/sessions/:sessionId/answer
Answer an AskUserQuestion (when mode=pause).

```json
// Request
{ "answer": "Use JWT tokens, not session cookies" }
```
**Side effect**: Write answer to claude's stdin (if using stream-json input) or resume with new prompt.

### GET /api/sessions/:sessionId/events
Paginated event log. Query params: `after_id`, `limit`, `event_type`.

```json
// Response 200
{
  "events": [
    { "id": 1, "event_type": "system", "data": {...}, "created_at": 1711152000 },
    { "id": 2, "event_type": "assistant", "data": {"text": "I'll start by..."}, "created_at": 1711152001 }
  ],
  "has_more": true
}
```

---

## Quality Gate (PR Review)

### GET /api/projects/:projectId/reviews
List PRs pending review.

### GET /api/reviews/:sessionId
PR review detail: diff + AI review comments.

```json
// Response 200
{
  "pr": { "url": "https://github.com/...", "title": "...", "branch": "epic/rate-limiting" },
  "diff": { "files": [{ "path": "src/middleware/rate-limit.ts", "additions": 45, "deletions": 2, "patch": "..." }] },
  "ai_review": {
    "status": "changes_requested",
    "comments": [
      { "file": "src/middleware/rate-limit.ts", "line": 23, "body": "Missing error handling for Redis connection failure", "severity": "high" }
    ],
    "checks": { "ubs": "pass", "security": "1 warning", "standards": "pass" }
  },
  "human_comments": []
}
```

### POST /api/reviews/:sessionId/comment
*Requires: PM, Dev, or TechLead*

```json
// Request
{ "file": "src/middleware/rate-limit.ts", "line": 23, "body": "Good catch, please add try/catch with fallback" }
```
**Side effect**: Trigger Worker Agent to fix → push → re-review cycle.

### POST /api/reviews/:sessionId/merge
*Requires: PM or TechLead*

```json
// Request
{ "strategy": "squash" }
```
**Side effects**:
1. `gh pr merge --squash <pr-url>`
2. `br close <epic-bead-id> --reason "Merged PR #123"`
3. Update epic ui_status → `done`
4. Webhook notification
5. `git branch -d epic/<slug>` cleanup

---

## Graph & Analytics

### GET /api/projects/:projectId/graph
Dependency graph data for React Flow.

```json
// Response 200
{
  "nodes": [{ "id": "bd-42", "title": "...", "status": "open", "priority": 1, "type": "epic" }],
  "edges": [{ "source": "bd-43", "target": "bd-42", "type": "blocks" }],
  "insights": {
    "critical_path": ["bd-45", "bd-44", "bd-42"],
    "bottlenecks": [{ "id": "bd-44", "betweenness": 0.85 }],
    "ready": ["bd-45", "bd-46"]
  }
}
```

### GET /api/projects/:projectId/graph/triage
`bv --robot-triage` output.

### GET /api/projects/:projectId/graph/plan
`bv --robot-plan` output — parallel execution tracks.

---

## Knowledge Rules (CM)

### GET /api/projects/:projectId/rules
List rules. Query params: `category`, `maturity`, `min_confidence`.

### POST /api/projects/:projectId/rules
*Requires: TechLead*

```json
// Request
{ "rule_text": "Always use structured logging with correlation IDs", "category": "coding", "confidence": 0.8 }
```

### PATCH /api/projects/:projectId/rules/:ruleId
*Requires: TechLead*

Update confidence, maturity, approve auto-generated rule.

### DELETE /api/projects/:projectId/rules/:ruleId
*Requires: TechLead*

---

## Agent Mail (Proxy)

### GET /api/projects/:projectId/mail/threads
List message threads for the project. Proxies to Agent Mail `search_messages`.

### GET /api/projects/:projectId/mail/threads/:threadId
Thread detail (messages in thread). Proxies to Agent Mail `summarize_thread`.

---

## Beads Sync

### GET /api/projects/:projectId/beads-sync/status
Current sync status.

```json
// Response 200
{
  "status": "ok",              // "ok" | "conflict" | "paused"
  "last_synced_at": 1711152000,
  "pending_changes": false,
  "error": null
}
// or when there is a conflict:
{
  "status": "conflict",
  "last_synced_at": 1711148000,
  "pending_changes": true,
  "error": "Rebase conflict on .beads/issues.jsonl",
  "host_command": "cd /data/projects/myapp && git status"
}
```

### POST /api/projects/:projectId/beads-sync/resume
*Requires: TechLead*

Resume sync after the TechLead has manually resolved the conflict on the host.

```json
// Response 200
{ "status": "ok", "message": "Sync resumed" }

// Response 409 (repo still has conflicts)
{ "error": "Repo still has unresolved conflicts. Run: git status" }
```

### POST /api/projects/:projectId/beads-sync/force
*Requires: TechLead*

Force sync — export the current beads DB and overwrite remote.

```json
// Request (confirmation required)
{ "confirm": true, "strategy": "force_local" }
// strategy: "force_local" (push local, overwrite remote)
//         | "force_remote" (pull remote, overwrite local DB)
```

---

## Webhooks

### GET /api/projects/:projectId/webhooks
List configured webhooks.

### POST /api/projects/:projectId/webhooks
*Requires: PM or TechLead*

```json
// Request
{ "type": "slack", "url": "https://hooks.slack.com/...", "events": ["session_complete", "pr_ready", "pr_merged"] }
```

---

## Notifications

### GET /api/notifications
Current user's notifications. Query params: `read=false`, `limit`.

### PATCH /api/notifications/:id
Mark as read.

### POST /api/notifications/mark-all-read

---

## Socket.IO Events

### Server → Client

| Event | Room | Payload | When |
|-------|------|---------|------|
| `capture:created` | `project:<id>` | Capture object | Someone creates a capture |
| `epic:created` | `project:<id>` | Epic object | New epic created |
| `epic:updated` | `project:<id>` | Epic object | Status change |
| `session:started` | `project:<id>` | Session summary | Agent spawn |
| `session:event` | `session:<id>` | NDJSON line | Each output line from claude |
| `session:question` | `session:<id>` | Question object | AskUserQuestion triggered |
| `session:completed` | `session:<id>` + `project:<id>` | Session result | Agent done |
| `session:failed` | `session:<id>` + `project:<id>` | Error details | Agent crashed |
| `pr:created` | `project:<id>` | PR info | Auto PR created |
| `pr:reviewed` | `project:<id>` | Review result | AI review done |
| `pr:merged` | `project:<id>` | Merge info | PR merged |
| `queue:updated` | `project:<id>` | Queue state | Queue position changed |
| `notification` | `user:<id>` | Notification object | New notification |

### Client → Server

| Event | Payload | Action |
|-------|---------|--------|
| `join:project` | `{ projectId }` | Join project room |
| `join:session` | `{ sessionId }` | Join session room (live streaming) |
| `leave:session` | `{ sessionId }` | Leave session room |
| `session:answer` | `{ sessionId, answer }` | Answer AskUserQuestion |
| `session:cancel` | `{ sessionId }` | Cancel running session |
