# Database Schema — claude-team-ws

## Database Strategy

### Tại sao SQLite?

Workspace app chạy trên **1 Mac Mini duy nhất** — single server, single process (Express). Trong context này:

| Tiêu chí | SQLite | PostgreSQL / MySQL |
|---|---|---|
| Deployment | Zero config, 1 file | Cần install, configure, maintain server |
| Backup | Copy 1 file (`cp workspace.db workspace.db.bak`) | `pg_dump`, cron jobs, storage |
| Performance (single server) | Nhanh hơn cho reads, đủ cho writes | Overhead network protocol không cần thiết |
| Concurrency | WAL mode: concurrent reads + serialized writes | Full MVCC — overkill cho 1 server |
| Ops burden | Không có gì | Updates, vacuum, connection pooling, monitoring |
| Disk footprint | ~50MB cho 10K sessions | ~200MB+ cho DB engine |

**Khi nào cần chuyển sang PostgreSQL?** Nếu tương lai cần:
- Multiple server instances (horizontal scaling)
- Concurrent writes từ nhiều processes (>1 Express instance)
- Advanced queries (full-text search, JSON operators, window functions)
- Separate database server (security isolation)

Hiện tại single Mac Mini + 1 Express process → SQLite là lựa chọn tối ưu.

### 2 Data Stores

Hệ thống dùng **2 SQLite databases riêng biệt**, mỗi cái có owner và lifecycle khác nhau:

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Data Store 1: App SQLite                                        │
│  ─────────────────────────────                                   │
│  File:    {project_root}/data/workspace.db                       │
│  Owner:   Express server (Drizzle ORM)                           │
│  Access:  Direct SQL queries                                     │
│  Backup:  Copy file, hoặc Drizzle export                         │
│  Content: users, sessions, session_events, captures,             │
│           epics (metadata), repos, knowledge_rules,              │
│           agent_queue, notifications, activity_log,              │
│           webhook_configs, project_members                       │
│                                                                  │
│  → Mọi thứ NGOẠI TRỪ issues/beads                               │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Data Store 2: Beads SQLite                                      │
│  ─────────────────────────────                                   │
│  File:    {project_root}/.beads/beads.db                         │
│  Owner:   Beads Rust (`br` CLI)                                  │
│  Access:  CHỈNH qua `br` CLI (execFile) — KHÔNG query trực tiếp │
│  Sync:    Export → .beads/issues.jsonl (git-tracked)             │
│  Content: issues, dependencies, comments, labels, audit trail    │
│                                                                  │
│  → Source of truth cho tất cả issues/epics/beads                 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Tại sao 2 databases tách biệt thay vì gộp 1?**

| Lý do | Giải thích |
|---|---|
| **Ownership boundary** | `br` CLI owns beads.db — nó manage schema, migrations, WAL, vacuum. Nếu Express truy cập trực tiếp → coupling với br internal schema, breaking khi br upgrade. |
| **Sync model khác nhau** | App DB chỉ sống trên host (không cần sync ra git). Beads DB phải sync qua git (JSONL) cho team visibility. Gộp 1 DB → phải sync toàn bộ (kể cả session_events — rất lớn). |
| **Lifecycle khác nhau** | App DB có thể reset/migrate mà không ảnh hưởng issues. Beads DB là persistent dữ liệu project — sống lâu hơn workspace app. |
| **Tooling** | `bv` (graph analysis) đọc trực tiếp beads.db. Nếu gộp → bv phải hiểu schema của app. |

**Quy tắc tuyệt đối:**
- Express server **KHÔNG BAO GIỜ** `import Database from 'better-sqlite3'` trên `.beads/beads.db`
- Mọi interaction với beads qua `execFile('br', [...], { cwd: projectRoot })`
- Nếu cần data từ beads, gọi `br show <id> --json` rồi parse JSON response

### SQLite Configuration

**App SQLite** (`workspace.db`):

```typescript
// packages/server/src/db/index.ts
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(process.env.DATABASE_PATH || './data/workspace.db')

// WAL mode: concurrent reads trong khi 1 write đang diễn ra
sqlite.pragma('journal_mode = WAL')

// Tăng cache cho read performance
sqlite.pragma('cache_size = -64000')  // 64MB

// Enforce foreign keys
sqlite.pragma('foreign_keys = ON')

// Sync mode: NORMAL đủ an toàn cho WAL (faster than FULL)
sqlite.pragma('synchronous = NORMAL')

export const db = drizzle(sqlite)
```

**Beads SQLite** (`.beads/beads.db`):
- Managed hoàn toàn bởi `br` CLI
- `br` tự set WAL mode, cache, vacuum
- Express server không cần (và không nên) configure

### Data Volume Estimates

| Table | Growth rate | Rows sau 6 tháng | Size estimate |
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

**session_events là bảng lớn nhất** — mỗi agent session sinh ~500 NDJSON events. Cần cleanup strategy:

```typescript
// Cleanup sessions cũ hơn 90 ngày
async function cleanupOldSessionEvents() {
  const cutoff = Math.floor(Date.now() / 1000) - (90 * 24 * 3600)

  // Archive trước khi xóa (optional)
  // ... export to file ...

  await db.delete(sessionEvents)
    .where(lt(sessionEvents.created_at, cutoff))

  // Reclaim disk space
  sqlite.pragma('wal_checkpoint(TRUNCATE)')
  // Periodic VACUUM (weekly cron hoặc PM2 scheduled restart)
}
```

### Backup Strategy

```bash
# Daily backup (cron job trên Mac Mini)
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
| name | TEXT | NOT NULL | Tên hiển thị |
| email | TEXT | UNIQUE | Email đăng nhập |
| role | TEXT | NOT NULL, DEFAULT 'member' | `pm` \| `dev` \| `techlead` \| `viewer` |
| api_key | TEXT | UNIQUE | Per-user API key cho remote access |
| avatar_url | TEXT | | URL avatar (optional) |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_users_email` on (email), `idx_users_api_key` on (api_key)

---

### projects

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| name | TEXT | NOT NULL | Tên project |
| slug | TEXT | NOT NULL, UNIQUE | URL-safe identifier |
| project_root | TEXT | NOT NULL, UNIQUE | Absolute path tới project root (chứa `.beads/`, `repos/`) |
| max_concurrent_agents | INTEGER | NOT NULL, DEFAULT 3 | Giới hạn agents đồng thời |
| ask_question_mode | TEXT | NOT NULL, DEFAULT 'hybrid' | `pause` \| `auto` \| `hybrid` |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Note:** `project_root` = umbrella repo root. `.beads/` luôn ở `{project_root}/.beads/`. `repos/` luôn ở `{project_root}/repos/`.

---

### repos

Mỗi row = 1 git repo trong project. Thay thế JSON array cũ — cho phép add/remove repos động.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| name | TEXT | NOT NULL | Tên repo (vd: `backend`). Unique trong project. |
| git_url | TEXT | | Remote URL (vd: `git@github.com:team/backend.git`). NULL nếu linked local |
| path | TEXT | NOT NULL | Absolute path (luôn dạng `{project_root}/repos/{name}`) |
| default_branch | TEXT | NOT NULL, DEFAULT 'main' | Branch mặc định |
| link_mode | TEXT | NOT NULL, DEFAULT 'clone' | `clone` (app cloned) \| `symlink` (linked existing) |
| status | TEXT | NOT NULL, DEFAULT 'ready' | `cloning` \| `ready` \| `error` |
| added_by | TEXT | NOT NULL, FK → users.id | Ai thêm repo |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_repos_project` on (project_id)
**Unique**: (project_id, name) — không 2 repos cùng tên trong 1 project

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
| user_id | TEXT | NOT NULL, FK → users.id | Ai capture |
| text | TEXT | NOT NULL | Nội dung capture |
| status | TEXT | NOT NULL, DEFAULT 'pending' | `pending` \| `triaged` \| `deferred` \| `dismissed` |
| triage_result | TEXT | | JSON: `{"type": "epic", "epic_bead_id": "bd-42"}` hoặc `{"type": "quick-fix", "commit": "abc123"}` |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| triaged_at | INTEGER | | Thời điểm triage |
| triaged_by | TEXT | FK → users.id | Ai triage |

**Index**: `idx_captures_project_status` on (project_id, status)

---

### epics

Link giữa app và Beads Rust epic. Beads Rust giữ source of truth cho title, description, status. App DB giữ metadata cho UI + agent management.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| bead_epic_id | TEXT | NOT NULL | ID trong br (vd: `bd-42`). Source of truth là br. |
| git_branches | TEXT | NOT NULL, DEFAULT '[]' | JSON: `[{"repo": "backend", "branch": "epic/auth-refactor"}]` |
| ui_status | TEXT | NOT NULL, DEFAULT 'draft' | `draft` \| `ready` \| `in_progress` \| `in_review` \| `done` \| `cancelled` |
| scope_analysis | TEXT | | JSON: kết quả auto-detect split (tokens, files, complexity) |
| split_proposal | TEXT | | JSON: đề xuất Beads nếu scope quá lớn |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| updated_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_epics_project` on (project_id), `idx_epics_bead` on (bead_epic_id)

---

### sessions

Mỗi row = 1 lần spawn Claude CLI cho 1 Epic.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| epic_id | TEXT | FK → epics.id | Linked Epic (optional cho ad-hoc sessions) |
| user_id | TEXT | NOT NULL, FK → users.id | Ai spawn |
| claude_session_id | TEXT | | UUID dùng cho `--session-id` / `-r` resume |
| agent_mail_name | TEXT | | Tên agent trong Agent Mail (vd: "BlueLake") |
| model | TEXT | NOT NULL, DEFAULT 'sonnet' | claude model alias |
| status | TEXT | NOT NULL, DEFAULT 'queued' | `queued` \| `running` \| `waiting_input` \| `validation_failed` \| `completed` \| `failed` \| `cancelled` \| `detached` |
| prompt | TEXT | NOT NULL | Prompt gửi cho claude (đã inject CM rules + CASS) |
| pid | INTEGER | | OS process ID (cho kill) |
| exit_code | INTEGER | | |
| pr_url | TEXT | | URL của PR nếu đã tạo |
| pr_status | TEXT | | `pending_review` \| `changes_requested` \| `approved` \| `merged` |
| started_at | INTEGER | | |
| finished_at | INTEGER | | |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_sessions_project_status` on (project_id, status), `idx_sessions_epic` on (epic_id)

---

### session_events

Append-only log. Mỗi dòng NDJSON từ `claude --output-format=stream-json` = 1 row.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| session_id | TEXT | NOT NULL, FK → sessions.id | |
| event_type | TEXT | NOT NULL | `system` \| `assistant` \| `tool_use` \| `tool_result` \| `result` \| `error` |
| data | TEXT | NOT NULL | Raw JSON line từ stream-json |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_events_session` on (session_id)

**Lưu ý**: Table này grow nhanh. Cần periodic cleanup cho sessions cũ (giữ 30 ngày, archive to file).

---

### agent_queue

Queue cho sessions khi concurrency limit đầy.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| epic_id | TEXT | NOT NULL, FK → epics.id | |
| user_id | TEXT | NOT NULL, FK → users.id | |
| priority | INTEGER | NOT NULL, DEFAULT 2 | 0=critical, 4=low (match br priority) |
| prompt | TEXT | NOT NULL | |
| model | TEXT | NOT NULL, DEFAULT 'sonnet' | |
| status | TEXT | NOT NULL, DEFAULT 'queued' | `queued` \| `picked` \| `cancelled` |
| position | INTEGER | NOT NULL | Thứ tự trong queue |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |
| picked_at | INTEGER | | Khi được dequeue và spawn |

**Index**: `idx_queue_project_status` on (project_id, status, priority, position)

---

### knowledge_rules

CM rules managed qua UI bởi TechLead. Proxy tới CM MCP server.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| rule_text | TEXT | NOT NULL | Nội dung rule (vd: "Always use structured logging") |
| category | TEXT | NOT NULL, DEFAULT 'general' | `coding` \| `security` \| `testing` \| `architecture` \| `general` |
| confidence | REAL | NOT NULL, DEFAULT 0.5 | 0.0–1.0, decay theo thời gian |
| maturity | TEXT | NOT NULL, DEFAULT 'candidate' | `candidate` \| `established` \| `proven` \| `deprecated` |
| source | TEXT | NOT NULL, DEFAULT 'manual' | `manual` (TechLead tạo) \| `auto` (synthesize từ review rejection) |
| source_session_id | TEXT | FK → sessions.id | Session mà rule được tạo từ (nếu auto) |
| approved_by | TEXT | FK → users.id | TechLead approve (required cho auto rules) |
| helpful_count | INTEGER | NOT NULL, DEFAULT 0 | Số lần rule giúp ích |
| harmful_count | INTEGER | NOT NULL, DEFAULT 0 | Số lần rule gây hại (4x weight) |
| last_validated_at | INTEGER | | Lần cuối rule được confirm hữu ích |
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

In-app notifications cho team members.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PK | UUID v4 |
| user_id | TEXT | NOT NULL, FK → users.id | Recipient |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| type | TEXT | NOT NULL | `agent_complete` \| `pr_ready` \| `review_needed` \| `question_waiting` \| `merge_complete` |
| title | TEXT | NOT NULL | Notification title |
| body | TEXT | | Detail text |
| link | TEXT | | Deep link trong UI (vd: `/projects/abc/epics/def`) |
| read | INTEGER | NOT NULL, DEFAULT 0 | |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_notifications_user_read` on (user_id, read)

---

### activity_log

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | INTEGER | PK, AUTOINCREMENT | |
| project_id | TEXT | NOT NULL, FK → projects.id | |
| user_id | TEXT | FK → users.id | NULL cho system actions |
| action | TEXT | NOT NULL | `capture_created` \| `epic_created` \| `session_started` \| `session_completed` \| `pr_created` \| `pr_merged` \| `rule_created` \| `bead_status_changed` |
| details | TEXT | | JSON blob (action-specific) |
| created_at | INTEGER | NOT NULL, DEFAULT unixepoch() | |

**Index**: `idx_activity_project` on (project_id, created_at DESC)

---

## Beads Rust Schema (Reference Only — managed by `br`)

Không modify trực tiếp. Interact qua `br` CLI.

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
- `drizzle-kit generate` cho migration files
- Migrations stored in `drizzle/migrations/`
- No down migrations (append-only schema evolution)
