# Per-Project Claude Config Management — Design Doc

**Date**: 2026-03-28
**Status**: Draft
**Context**: Every project in the workspace should have its own skills, agents, commands, and CLAUDE.md — manageable from the web UI.

## Approach: UI Manages `.claude/` Files Directly

The Agent SDK discovers config from filesystem `.claude/` directories. No DB abstraction needed — the filesystem IS the config store. The UI provides a CRUD layer over these files.

## Architecture

```
Web UI (Settings → Claude Config tab)
  ↕ REST API
packages/server/src/routes/claude-config.ts
  ↕ fs.readFileSync / fs.writeFileSync
${project_root}/.claude/   ← project-level config
${repo.path}/.claude/      ← per-repo config (scoped by target_dir)
  ↕ SDK reads at session start
Agent SDK query({ cwd, settingSources: ['user', 'project'] })
```

No database tables for config storage. Files on disk are the single source of truth.

## API Design

Mounted at `/api/projects/:projectId/claude-config`

### CLAUDE.md

```
GET    /claude-md              → { content: string, mtime: number }
PUT    /claude-md              → { content: string, expected_mtime?: number }
```

### Skills

```
GET    /skills                 → { skills: [{ name, description, triggers, mtime }] }
GET    /skills/:name           → { name, content: string, mtime: number }
PUT    /skills/:name           → { content: string, expected_mtime?: number }
DELETE /skills/:name           → 204
```

### Agents

```
GET    /agents                 → { agents: [{ name, description, model, mtime }] }
GET    /agents/:name           → { name, content: string, mtime: number }
PUT    /agents/:name           → { content: string, expected_mtime?: number }
DELETE /agents/:name           → 204
```

### Commands

```
GET    /commands               → { commands: [{ name, description, mtime }] }
GET    /commands/:name         → { name, content: string, mtime: number }
PUT    /commands/:name         → { content: string, expected_mtime?: number }
DELETE /commands/:name         → 204
```

### Rules

```
GET    /rules                  → { rules: [{ name, mtime }] }
GET    /rules/:name            → { name, content: string, mtime: number }
PUT    /rules/:name            → { content: string, expected_mtime?: number }
DELETE /rules/:name            → 204
```

### Repo-scoped config

All endpoints accept optional query param `?repo=<repoId>` to target a specific repo's `.claude/` instead of the project root.

```
GET /skills?repo=repo_abc123   → skills from ${repo.path}/.claude/skills/
```

### Settings.json (read-only)

```
GET    /settings               → { settings: object }
```

Read-only view of `.claude/settings.json` and `.claude/settings.local.json`. Not editable from UI to avoid breaking hooks/permissions.

## Service Layer

```typescript
// packages/server/src/services/claude-config-service.ts

class ClaudeConfigService {
  constructor(private basePath: string) {}

  // Resolve .claude/ path for project or repo
  private claudeDir(): string { return join(this.basePath, '.claude') }

  // CLAUDE.md
  getClaudeMd(): { content: string; mtime: number } | null
  putClaudeMd(content: string, expectedMtime?: number): void

  // Skills (.claude/skills/<name>/SKILL.md)
  listSkills(): SkillSummary[]
  getSkill(name: string): { content: string; mtime: number }
  putSkill(name: string, content: string, expectedMtime?: number): void
  deleteSkill(name: string): void

  // Agents (.claude/agents/<name>.md)
  listAgents(): AgentSummary[]
  getAgent(name: string): { content: string; mtime: number }
  putAgent(name: string, content: string, expectedMtime?: number): void
  deleteAgent(name: string): void

  // Commands (.claude/commands/<name>.md)
  // Rules (.claude/rules/<name>.md)
  // Same pattern as agents
}
```

### File layout on disk

```
.claude/
├── CLAUDE.md
├── settings.json
├── settings.local.json
├── skills/
│   ├── triage/
│   │   └── SKILL.md
│   └── demo-to-prod/
│       └── SKILL.md
├── agents/
│   ├── code-reviewer.md
│   └── worker.md
├── commands/
│   └── deploy.md
└── rules/
    └── api-conventions.md
```

## Conflict Detection

### Optimistic mtime check

Every GET returns `mtime` (file modification timestamp). On PUT, client sends `expected_mtime`. If file's current mtime differs:

```typescript
putSkill(name: string, content: string, expectedMtime?: number): void {
  const filepath = join(this.claudeDir(), 'skills', name, 'SKILL.md')

  if (expectedMtime !== undefined) {
    const stat = statSync(filepath, { throwIfNoEntry: false })
    if (stat && Math.floor(stat.mtimeMs) !== expectedMtime) {
      throw new ConflictError('File modified since last read')
    }
  }

  mkdirSync(dirname(filepath), { recursive: true })
  writeFileSync(filepath, content, 'utf-8')
}
```

API returns `409 Conflict` with current file content so UI can show diff.

### fs.watch for live sync

Watch `.claude/` directories for external changes (dev editing files in their editor):

```typescript
// In session-runner.ts or separate watcher service
watch(join(projectRoot, '.claude'), { recursive: true }, (event, filename) => {
  emitToProject(projectId, 'claude-config:changed', { event, filename })
})
```

Client invalidates TanStack Query cache on this event → UI auto-refreshes.

## Frontend

### New tab in project settings: "Claude Config"

```
Settings
├── Project (existing)
├── Users (existing)
├── Webhooks (existing)
├── Safety (new, from safety epic)
└── Claude Config (new)
    ├── CLAUDE.md — monaco editor, markdown preview
    ├── Skills — list with create/edit/delete
    ├── Agents — list with create/edit/delete
    ├── Commands — list with create/edit/delete
    └── Rules — list with create/edit/delete
```

### Scope selector

When project has multiple repos, show dropdown at top:
```
Scope: [Project Root ▾]  ← default
       Repo: frontend-app
       Repo: backend-api
```

Changing scope reloads all config from that repo's `.claude/`.

### Skill/Agent/Command editor

- Monaco editor with markdown syntax highlighting
- SKILL.md template with frontmatter pre-filled on create
- Validate frontmatter (name, description required) before save
- Show "Last modified: 2 min ago" with mtime
- Conflict dialog when 409: show diff, offer "Overwrite" or "Reload"

### CLAUDE.md editor

- Full-page monaco editor
- Markdown preview toggle
- Word count / token estimate

## Multi-Repo Behavior

| Session target_dir | Config loaded by SDK |
|---|---|
| `project_root` | `project_root/.claude/` |
| `repo.path` (e.g., `/code/my-repo`) | `repo.path/.claude/` |

The SDK walks from `cwd` upward, so:
- Session at `/code/project/repos/frontend/` loads `/code/project/repos/frontend/.claude/` first
- If not found, walks up to `/code/project/.claude/`

This means project-root config acts as a **fallback/shared config**, and repo-level config can override or extend it. No merge logic needed from our side — the SDK handles it.

## Knowledge Rules Bridge

The existing `knowledgeRules` table has maturity tracking (draft → reviewed → proven). Add a one-click action:

**"Export to .claude/rules/"** — writes a proven rule as a `.claude/rules/<slug>.md` file so agent sessions pick it up automatically.

This keeps the DB as the curation layer and the filesystem as the delivery layer.

## Access Control

- **Read** (GET): all project members (PM, Dev, TechLead, Viewer)
- **Write** (PUT/DELETE): PM, TechLead only (use `requireRole('pm', 'techlead')`)
- **Settings.json**: read-only for all (not editable from UI)

## Git Integration (Optional, stretch)

After config changes via UI, offer:
- "Commit changes" button → `git add .claude/ && git commit -m "chore: update Claude config via workspace UI"`
- Show git status badge on files (modified/untracked/committed)

## Implementation Priority

### Phase 1 (Core)
1. ClaudeConfigService — filesystem CRUD with mtime conflict detection
2. REST routes — mounted at /api/projects/:projectId/claude-config
3. Claude Config tab in settings — CLAUDE.md editor + skills list

### Phase 2 (Full editor)
4. Agent/Command/Rules editors
5. Repo scope selector
6. fs.watch live sync via Socket.IO

### Phase 3 (Polish)
7. Knowledge rules → .claude/rules export bridge
8. Git integration (commit button, status badges)
9. Skill/agent templates for quick creation

## Important Caveat

**Auto memory is CLI-only.** Files in `~/.claude/projects/.../memory/` are NOT loaded by the Agent SDK. Any session-relevant knowledge must live in CLAUDE.md, skills, or rules — not in memory files. The UI should make this clear.
