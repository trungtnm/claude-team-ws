# Database Schema — claude-team-ws

## Database Strategy

### Why SQLite?

The workspace app runs on **a single Mac Mini** — single server, single process (Express). In this context:

| Criterion | SQLite | PostgreSQL / MySQL |
|---|---|---|
| Deployment | Zero config, 1 file | Requires install, configure, maintain server |
| Backup | Copy 1 file (`cp workspace.db workspace.db.bak`) | `pg_dump`, cron jobs, storage |
| Performance (single server) | Faster for reads, sufficient for writes | Unnecessary network protocol overhead |
| Concurrency | WAL mode: concurrent reads + serialized writes | Full MVCC — overkill for 1 server |
| Ops burden | None | Updates, vacuum, connection pooling, monitoring |
| Disk footprint | ~50MB for 10K sessions | ~200MB+ for DB engine |

**When to switch to PostgreSQL?** If in the future you need:
- Multiple server instances (horizontal scaling)
- Concurrent writes from multiple processes (>1 Express instance)
- Advanced queries (full-text search, JSON operators, window functions)
- Separate database server (security isolation)

Currently single Mac Mini + 1 Express process → SQLite is the optimal choice.

### 2 Data Stores

The system uses **2 separate SQLite databases**, each with a different owner and lifecycle:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Data Store 1: App SQLite                                        │
│  ─────────────────────────────                                   │
│  File:    {project_root}/data/workspace.db                       │
│  Owner:   Express server (Drizzle ORM)                           │
│  Access:  Direct SQL queries                                     │
│  Backup:  Copy file, or Drizzle export                           │
│  Content: users, sessions, session_events, captures,             │
│           epics (metadata), repos, knowledge_rules,              │
│           agent_queue, notifications, activity_log,              │
│           webhook_configs, project_members                       │
│                                                                  │
│  → Everything EXCEPT issues/beads                                │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Data Store 2: Beads SQLite                                      │
│  ─────────────────────────────                                   │
│  File:    {project_root}/.beads/beads.db                         │
│  Owner:   Beads Rust (`br` CLI)                                  │
│  Access:  ONLY via `br` CLI (execFile) — NEVER query directly    │
│  Sync:    Export → .beads/issues.jsonl (git-tracked)             │
│  Content: issues, dependencies, comments, labels, audit trail    │
│                                                                  │
│  → Source of truth for all issues/epics/beads                    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Why 2 separate databases instead of 1?**

| Reason | Explanation |
|---|---|
| **Ownership boundary** | `br` CLI owns beads.db — it manages schema, migrations, WAL, vacuum. If Express accessed it directly → coupling with br internal schema, breaking when br upgrades. |
| **Different sync models** | App DB only lives on the host (no need to sync to git). Beads DB must sync via git (JSONL) for team visibility. Merging into 1 DB → would need to sync everything (including session_events — very large). |
| **Different lifecycles** | App DB can be reset/migrated without affecting issues. Beads DB is persistent project data — it outlives the workspace app. |
| **Tooling** | `bv` (graph analysis) reads beads.db directly. If merged → bv would need to understand the app schema. |

**Absolute rules:**
- Express server **MUST NEVER** `import Database from 'better-sqlite3'` on `.beads/beads.db`
- All interaction with beads via `execFile('br', [...], { cwd: projectRoot })`
- If you need data from beads, call `br show <id> --json` and parse the JSON response

### SQLite Configuration

**App SQLite** (`workspace.db`):

```typescript
// packages/server/src/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(process.env.DATABASE_PATH || './data/workspace.db')

// WAL mode: concurrent reads while a write is in progress
sqlite.pragma('journal_mode = WAL')

// Increase cache for read performance
sqlite.pragma('cache_size = -64000')  // 64MB

// Enforce foreign keys
sqlite.pragma('foreign_keys = ON')

// Sync mode: NORMAL is safe enough for WAL (faster than FULL)
sqlite.pragma('synchronous = NORMAL')

export const db = drizzle(sqlite)
```

**Beads SQLite** (`.beads/beads.db`):
- Fully managed by `br` CLI
- `br` sets WAL mode, cache, vacuum on its own
- Express server does not need to (and should not) configure it

### Data Volume Estimates

| Table | Growth rate | Rows after 6 months | Size estimate |
|---|---|---|---|
| users | Slow (team size) | ~20 | <1KB |
| projects | Slow | ~5 | <1KB |
| repos | Slow | ~15 | <1KB |
| captures | ~5/day | ~900 | ~100KB |
| epics | ~3/week | ~80 | ~50KB |
| sessions | ~5/day | ~900 | ~200KB |
| **session_events** | **~500/session** | **~450K** | **~200MB** ← largest table |
| knowledge_rules | ~2/week | ~50 | ~20KB |
| notifications | ~10/day | ~1800 | ~500KB |
| activity_log | ~20/day | ~3600 | ~1MB |

**session_events is the largest table** — each agent session generates ~500 NDJSON events. Needs a cleanup strategy:

```typescript
// Cleanup sessions older than 90 days
async function cleanupOldSessionEvents() {
  const cutoff = Math.floor(Date.now() / 1000) - (90 * 24 * 3600)

  // Archive before deleting (optional)
  // ... export to file ...

  await db.delete(sessionEvents)
    .where(lt(sessionEvents.created_at, cutoff))

  // Reclaim disk space
  sqlite.pragma('wal_checkpoint(TRUNCATE)')
  // Periodic VACUUM (weekly cron or PM2 scheduled restart)
}
```

### Backup Strategy

```bash
# Daily backup (cron job on Mac Mini)
# 0 2 * * * /data/scripts/backup-workspace.sh

#!/bin/bash
BACKUP_DIR="/data/backups/$(date +%Y-%m-%d)"
mkdir -p "$BACKUP_DIR"

# App SQLite — safe copy with WAL checkpoint
sqlite3 /data/projects/myapp/data/workspace.db ".backup '$BACKUP_DIR/workspace.db'"

# Beads — JSONL is already git-tracked, but backup DB too
sqlite3 /data/projects/myapp/.beads/beads.db ".backup '$BACKUP_DIR/beads.db'"

# Rotate: keep 30 days
find /data/backups -maxdepth 1 -mtime +30 -type d -exec rm -rf {} +
```

---

## App SQLite Schema

### users

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | Display name |
| email | TEXT | UNIQUE | Login email |
| role | TEXT | NOT NULL, DEFAULT 'member' | `pm` \| `dev` \| `techlead` \| `viewer` |
| api_key | TEXT | UNIQUE | Per-user API key for remote access |
| avatar_url | TEXT | | URL avatar (optional) |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_users_email` on (email), `idx_users_api_key` on (api_key)

---

### projects

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | Project name |
| slug | TEXT | NOT NULL, UNIQUE | URL-safe identifier |
| project_root | TEXT | NOT NULL, UNIQUE | Absolute path to the project root (contains `.beads/`, `repos/`) |
| max_concurrent_agents | INTEGER | NOT NULL, DEFAULT 3 | Concurrent agent limit |
| ask_question_mode | TEXT | NOT NULL, DEFAULT 'hybrid' | `pause` \| `auto` \| `hybrid` |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Note:** `project_root` = umbrella repo root. `.beads/` is always at `{project_root}/.beads/`. `repos/` is always at `{project_root}/repos/`.

---

### repos

Each row = 1 git repo in the project. Replaces the old JSON array — allows dynamic add/remove of repos.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| name | TEXT | NOT NULL | Repo name (e.g., `backend`). Unique within project. |
| git_url | TEXT | | Remote URL (e.g., `git@github.com:team/backend.git`). NULL if linked local |
| path | TEXT | NOT NULL | Absolute path (always in the form `{project_root}/repos/{name}`) |
| default_branch | TEXT | NOT NULL, DEFAULT 'main' | Default branch |
| link_mode | TEXT | NOT NULL, DEFAULT 'clone' | `clone` (app cloned) \| `symlink` (linked existing) |
| status | TEXT | NOT NULL, DEFAULT 'ready' | `cloning` \| `ready` \| `error` |
| added_by | TEXT | NOT NULL, FK → users.id | Who added the repo |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_repos_project` on (project_id)
**Unique**: (project_id, name) — no 2 repos with the same name in 1 project

---

### project_members

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| project_id | TEXT | FK → projects.id | |
| user_id | TEXT | FK → users.id | |
| role_override | TEXT | | Override user.role per project (optional) |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**PK**: (project_id, user_id)

---

### captures

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| user_id | TEXT | NOT NULL, FK → users.id | Who captured |
| text | TEXT | NOT NULL | Capture content |
| status | TEXT | NOT NULL, DEFAULT 'pending' | `pending` \| `triaged` \| `deferred` \| `dismissed` |
| triage_result | TEXT | | JSON: `{"type": "epic", "epic_bead_id": "bd-42"}` or `{"type": "quick-fix", "commit": "abc123"}` |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| triaged_at | INTEGER | | Time of triage |
| triaged_by | TEXT | FK → users.id | Who triaged |

**Index**: `idx_captures_project_status` on (project_id, status)

---

### epics

Link between the app and a Beads Rust epic. Beads Rust is the source of truth for title, description, status. App DB holds metadata for UI + agent management.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| bead_epic_id | TEXT | NOT NULL | ID in br (e.g., `bd-42`). Source of truth is br. |
| git_branches | TEXT | NOT NULL, DEFAULT '[]' | JSON: `[{"repo": "backend", "branch": "epic/auth-refactor"}]` |
| ui_status | TEXT | NOT NULL, DEFAULT 'blocked' | `blocked` \| `ready` \| `in_progress` \| `in_review` \| `done` \| `cancelled` |
| scope_analysis | TEXT | | JSON: auto-detect split result (tokens, files, complexity) |
| split_proposal | TEXT | | JSON: proposed Beads if scope is too large |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_epics_project` on (project_id), `idx_epics_bead` on (bead_epic_id)

---

### sessions

Each row = 1 Claude CLI spawn for 1 Epic.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| epic_id | TEXT | FK → epics.id | Linked Epic (optional for ad-hoc sessions) |
| user_id | TEXT | NOT NULL, FK → users.id | Who spawned |
| claude_session_id | TEXT | | UUID used for `--session-id` / `-r` resume |
| agent_mail_name | TEXT | | Agent name in Agent Mail (e.g., "BlueLake") |
| model | TEXT | NOT NULL, DEFAULT 'sonnet' | claude model alias |
| status | TEXT | NOT NULL, DEFAULT 'queued' | `queued` \| `running` \| `waiting_input` \| `validation_failed` \| `completed` \| `failed` \| `cancelled` \| `detached` |
| prompt | TEXT | NOT NULL | Prompt sent to claude (with injected CM rules + CASS) |
| pid | INTEGER | | OS process ID (for kill) |
| exit_code | INTEGER | | |
| pr_url | TEXT | | PR URL if created |
| pr_status | TEXT | | `pending_review` \| `changes_requested` \| `approved` \| `merged` |
| started_at | INTEGER | | |
| finished_at | INTEGER | | |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_sessions_project_status` on (project_id, status), `idx_sessions_epic` on (epic_id)

---

### session_events

Append-only log. Each NDJSON line from `claude --output-format=stream-json` = 1 row.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| session_id | TEXT | NOT NULL, FK → sessions.id | |
| event_type | TEXT | NOT NULL | `system` \| `assistant` \| `tool_use` \| `tool_result` \| `result` \| `error` |
| data | TEXT | NOT NULL | Raw JSON line from stream-json |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_events_session` on (session_id)

**Note**: This table grows fast. Needs periodic cleanup for old sessions (keep 30 days, archive to file).

---

### agent_queue

Queue for sessions when the concurrency limit is full.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| epic_id | TEXT | NOT NULL, FK → epics.id | |
| user_id | TEXT | NOT NULL, FK → users.id | |
| priority | INTEGER | NOT NULL, DEFAULT 2 | 0=critical, 4=low (matches br priority) |
| prompt | TEXT | NOT NULL | |
| model | TEXT | NOT NULL, DEFAULT 'sonnet' | |
| status | TEXT | NOT NULL, DEFAULT 'queued' | `queued` \| `picked` \| `cancelled` |
| position | INTEGER | NOT NULL | Order in queue |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| picked_at | INTEGER | | When dequeued and spawned |

**Index**: `idx_queue_project_status` on (project_id, status, priority, position)

---

### knowledge_rules

CM rules managed via UI by TechLead. Proxies to CM MCP server.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| rule_text | TEXT | NOT NULL | Rule content (e.g., "Always use structured logging") |
| category | TEXT | NOT NULL, DEFAULT 'general' | `coding` \| `security` \| `testing` \| `architecture` \| `general` |
| confidence | REAL | NOT NULL, DEFAULT 0.5 | 0.0–1.0, decays over time |
| maturity | TEXT | NOT NULL, DEFAULT 'candidate' | `candidate` \| `established` \| `proven` \| `deprecated` |
| source | TEXT | NOT NULL, DEFAULT 'manual' | `manual` (TechLead created) \| `auto` (synthesized from review rejection) |
| source_session_id | TEXT | FK → sessions.id | Session the rule was created from (if auto) |
| approved_by | TEXT | FK → users.id | TechLead approval (required for auto rules) |
| helpful_count | INTEGER | NOT NULL, DEFAULT 0 | Number of times the rule was helpful |
| harmful_count | INTEGER | NOT NULL, DEFAULT 0 | Number of times the rule was harmful (4x weight) |
| last_validated_at | INTEGER | | Last time the rule was confirmed useful |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_rules_project_category` on (project_id, category)

---

### webhook_configs

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| type | TEXT | NOT NULL | `slack` \| `discord` |
| url | TEXT | NOT NULL | Webhook URL |
| events | TEXT | NOT NULL, DEFAULT '["session_complete","pr_ready","pr_merged"]' | JSON array of event types |
| enabled | INTEGER | NOT NULL, DEFAULT 1 | |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

---

### notifications

In-app notifications for team members.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| user_id | TEXT | NOT NULL, FK → users.id | Recipient |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| type | TEXT | NOT NULL | `agent_complete` \| `pr_ready` \| `review_needed` \| `question_waiting` \| `merge_complete` |
| title | TEXT | NOT NULL | Notification title |
| body | TEXT | | Detail text |
| link | TEXT | | Deep link in UI (e.g., `/projects/abc/epics/def`) |
| read | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_notifications_user_read` on (user_id, read)

---

### activity_log

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| user_id | TEXT | FK → users.id | NULL for system actions |
| action | TEXT | NOT NULL | `capture_created` \| `epic_created` \| `session_started` \| `session_completed` \| `pr_created` \| `pr_merged` \| `rule_created` \| `bead_status_changed` |
| details | TEXT | | JSON blob (action-specific) |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_activity_project` on (project_id, created_at DESC)

---

## Beads Rust Schema (Reference Only — managed by `br`)

Do not modify directly. Interact via `br` CLI.

| Entity | Key Fields | Notes |
|--------|-----------|-------|
| Issues | id, title, description, status, type, priority, assignee, labels | `br list --json` |
| Dependencies | child_id, parent_id, type | `br dep add/remove` |
| Comments | issue_id, actor, message, created_at | `br comments add/list` |
| Audit Trail | issue_id, actor, action, timestamp | Immutable |

**Status values**: open, in_progress, blocked, deferred, draft, closed
**Type values**: task, bug, feature, epic, question, docs
**Priority**: 0 (critical) → 4 (backlog)

---

## Migration Strategy

- Drizzle ORM auto-migrate on server startup
- `drizzle-kit generate` for migration files
- Migrations stored in `drizzle/migrations/`
- No down migrations (append-only schema evolution)
