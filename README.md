# Claude Team Workspace — Semi-Auto Epic-Driven Dev Workspace

## Context

A shared workspace for dev teams on a Mac Mini host. PM/Dev capture ideas, triage them into Epics, trigger Agent sessions, and review via PR workflow.

---

## Architecture Decisions (Finalized)

| Decision | Choice |
|---|---|
| **Stack** | Vite + React (SPA) + Express (API) + SQLite (Drizzle) + Socket.IO |
| **Epic scope sizing** | Auto-detect + PM confirm |
| **Concurrency** | N agents/project (configurable). Queue when full |
| **Role model** | 4 roles: PM / Dev / TechLead / Viewer |
| **Git strategy** | 1 branch/Epic, squash merge into main |
| **Notifications** | In-app + Slack/Discord webhook |
| **AskUserQuestion** | Configurable 3 modes: pause, auto-decide, hybrid |
| **Workspace model** | 1 workspace = 1 project. Multi-repo, shared 1 Beads DB |
| **Cost tracking** | Not tracked in UI |
| **Host** | Mac Mini, serving via Cloudflare Tunnel |
| **Infrastructure** | Docker Compose for Agent Mail + CM. CASS + br + bv native on host |

---

## Infrastructure Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Mac Mini Host                     │
│                                                      │
│  ┌─── Docker Compose ────────────────────────────┐  │
│  │                                                │  │
│  │  agent-mail (Python MCP)     :8765            │  │
│  │  ├─ Message broker for multi-agent             │  │
│  │  ├─ Thread-based coordination                  │  │
│  │  └─ File reservations                          │  │
│  │                                                │  │
│  │  cm-memory (Bun/TS MCP)      :9900            │  │
│  │  ├─ Team procedural memory                     │  │
│  │  ├─ Confidence decay (90-day half-life)        │  │
│  │  └─ Anti-pattern learning                      │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─── Native on Host ────────────────────────────┐  │
│  │                                                │  │
│  │  workspace-app (Express + Vite)  :3000        │  │
│  │  ├─ Web UI (React SPA)                         │  │
│  │  ├─ API server (Express)                       │  │
│  │  └─ Socket.IO (real-time bidirectional)          │  │
│  │                                                │  │
│  │  claude CLI     ← spawned per Epic session     │  │
│  │  br CLI         ← Epic/Bead CRUD               │  │
│  │  bv CLI         ← Graph analysis               │  │
│  │  cass CLI       ← Session indexing & search     │  │
│  │  gh CLI         ← PR creation & management      │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Cloudflare Tunnel ──── remote team access ────────> │
└─────────────────────────────────────────────────────┘
```

### Why Docker for Agent Mail + CM, native for the rest?

- **Agent Mail** (Python MCP server): Long-running service, needs isolated Python env, persistent message store. Docker ensures clean restart, volume mount for data
- **CM** (Bun/TS MCP server): Long-running service on port 9900, needs persistent playbook/rules. Docker isolation + restart policy
- **CASS**: Pure CLI tool (Rust binary), no server needed. Called on-demand from workspace app
- **br/bv**: CLI tools, called via `execFile`. Need direct filesystem access (`.beads/` in project)
- **claude CLI**: Spawns OS process, needs host filesystem access + pre-authenticated credentials. Docker would add unnecessary complexity
- **Workspace app**: Runs native for easy filesystem access, process spawning, debugging. PM2 for auto-restart

---

## 5 Pillars

### 1. Epic-Driven Dashboard (Capture → Triage → Epic)

- **Capture Inbox**: Full page at `/captures`. New captures are created via a header CTA button (keyboard shortcut `Cmd+J`) that opens a Dialog. Attributed by user
- **AI-Powered Triage**: 4-phase triage process on the `/captures` page — analyzes capture, suggests scope, generates acceptance criteria, and proposes Beads breakdown
- **Epic-First Board**: Epics are the primary unit. Horizontal tab navigation: Board, Captures, Agents, Graph, Settings. Click an Epic for nested Beads detail
- **Auto-Detect Split**: Click "Start" → analyze scope → propose Beads → PM confirm
- **Status flow**: `Blocked → Ready → In Progress → In Review → Done` (Captures serve as the draft/intake stage; once triaged into an Epic, it starts as Blocked if it has dependencies, or Ready if unblocked)
- **Multi-repo, shared Beads**: 1 project across multiple repos, sharing 1 Beads DB

### 2. Semi-Auto Execution Engine

- **Trigger**: PM/Dev click "Start Agent Session" on Epic card
- **Scope Gate**: Auto-analyze → split proposal → PM confirm
- **Git Isolation**: `git checkout -b epic/<slug>` per repo
- **Configurable Concurrency**: Admin sets max concurrent agents. Queue with priority ordering
- **Context Injection**: Worker receives: Epic description, acceptance criteria, CM rules, CASS learnings
- **Live Tracking**: Socket.IO streaming real-time in Epic panel
- **AskUserQuestion 3 modes** (configurable per project)

### 3. Quality Gate: PR → AI Review → Human Merge

- **Auto PR**: Agent done → push → `gh pr create`
- **AI Peer Review**: Auto-spawn Code Review Agent (UBS + Security + Standards)
- **Human Review Module**: Diff + AI comments side-by-side
- **Feedback Loop**: Human comment → Worker fix → push → repeat
- **Merge**: PM/TechLead squash merge → close Epic → update Beads

### 4. Shared Memory Hub (CASS + CM + Agent Mail)

- **Agent Mail** (Docker, port 8765): Message broker for multi-agent coordination
  - Workers register on spawn: `register_agent(project, "claude", model, agent_name)`
  - Epic ID = thread_id: all messages within an Epic are linked
  - File reservations: prevent merge conflicts between concurrent agents
  - Orchestrator polls inbox: monitors worker progress, detects blockers
- **CASS** (native CLI): Index sessions, semantic search
  - `cass index` after each session completes
  - Worker queries `cass search --robot "similar problem"` before starting an Epic
  - Hybrid search: BM25 lexical + MiniLM vector
- **CM** (Docker, port 9900): Team procedural memory
  - "Team Rules" tab in UI. TechLead manages rules
  - Worker calls `cm_context` on spawn → gets relevant rules
  - Code Review rejection → `cm_feedback --harmful` → auto-synthesize rule
  - 90-day confidence decay. Anti-pattern learning (4x harmful multiplier)
  - Project-level rules (`.cass/playbook.yaml`) + global rules

### 5. Dependency Graph (bv-powered)

- **React Flow** graph from `bv --robot-plan`
- **Color**: Red=Critical Path, Orange=Bottleneck, Green=Ready
- **PM Decision Aid**: Visual guide for choosing which Epic to trigger next

---

## UI Layout

The application uses a horizontal header-based navigation (no sidebar):

```
┌──────────────────────────────────────────────────────────┐
│  Logo + Project Selector  │  Board  Captures  Agents  Graph  Settings  │  [+ Capture (Cmd+J)]  🔔  👤  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│                     Page Content                         │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

- **Board** (`/`): Epic Kanban with status columns
- **Captures** (`/captures`): Full-page capture list with AI triage workflow
- **Agents** (`/agents`): Active agent sessions, stream viewer, Q&A panel
- **Graph** (`/graph`): Dependency graph visualization (React Flow)
- **Settings** (`/settings`): Project configuration, user management, CM rules

---

## Role Permissions

| Action | PM | Dev | TechLead | Viewer |
|---|:---:|:---:|:---:|:---:|
| Capture ideas | ✅ | ✅ | ✅ | ❌ |
| Triage → Epic | ✅ | ❌ | ✅ | ❌ |
| Start Agent Session | ✅ | ✅ | ✅ | ❌ |
| View agent stream | ✅ | ✅ | ✅ | ✅ |
| Review PR / comment | ✅ | ✅ | ✅ | ❌ |
| Merge PR | ✅ | ❌ | ✅ | ❌ |
| Manage CM rules | ❌ | ❌ | ✅ | ❌ |
| Manage users/projects | ✅ | ❌ | ✅ | ❌ |
| View dashboard/graph | ✅ | ✅ | ✅ | ✅ |

---

## Technical Foundation

### Docker Compose (`docker/docker-compose.yml`)

```yaml
services:
  agent-mail:
    image: python:3.13-slim
    command: python -m mcp_agent_mail.cli serve-http --port 8765
    ports:
      - "127.0.0.1:8765:8765"
    volumes:
      - agent-mail-data:/data
    environment:
      - MCP_HTTP_TOKEN=${MCP_AGENT_MAIL_TOKEN}
    restart: unless-stopped

  cm-memory:
    image: oven/bun:latest
    command: cm serve --port 9900
    ports:
      - "127.0.0.1:9900:9900"
    volumes:
      - cm-data:/root/.cass-memory
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    restart: unless-stopped

volumes:
  agent-mail-data:
  cm-data:
```

### Project Structure

```
claude-team-ws/
├── docker/
│   ├── docker-compose.yml       # Agent Mail + CM
│   ├── agent-mail/Dockerfile
│   └── cm/Dockerfile
│
├── packages/
│   ├── client/                  # Vite + React SPA
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── kanban/      # Epic Kanban board
│   │   │   │   ├── capture/     # Capture dialog + triage
│   │   │   │   ├── agent/       # Agent stream + Q&A panel
│   │   │   │   ├── review/      # PR review module (diff viewer)
│   │   │   │   ├── graph/       # Dependency graph (React Flow)
│   │   │   │   ├── rules/       # CM rules management (TechLead)
│   │   │   │   ├── mail/        # Agent Mail thread viewer
│   │   │   │   └── ui/          # shadcn/ui
│   │   │   ├── hooks/
│   │   │   ├── stores/          # Zustand
│   │   │   └── pages/           # React Router
│   │   └── vite.config.ts
│   │
│   └── server/                  # Express API
│       ├── src/
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── beads.ts     # Proxy to br CLI
│       │   │   ├── epics.ts
│       │   │   ├── captures.ts
│       │   │   ├── sessions.ts  # Agent management
│       │   │   ├── graph.ts     # bv integration
│       │   │   ├── review.ts    # PR workflow
│       │   │   ├── rules.ts     # CM rules (proxy to CM MCP)
│       │   │   ├── mail.ts      # Agent Mail (proxy to MCP)
│       │   │   └── webhooks.ts  # Slack/Discord
│       │   ├── services/
│       │   │   ├── beads-service.ts     # br CLI wrapper
│       │   │   ├── bv-service.ts        # bv CLI wrapper
│       │   │   ├── agent-manager.ts     # Claude CLI process manager
│       │   │   ├── agent-mail-client.ts # HTTP client for Agent Mail MCP
│       │   │   ├── cm-client.ts         # HTTP client for CM MCP
│       │   │   ├── cass-service.ts      # cass CLI wrapper
│       │   │   ├── socket-manager.ts    # Socket.IO rooms & events
│       │   │   ├── git-service.ts       # Branch, PR, merge
│       │   │   └── webhook-service.ts   # Notification dispatch
│       │   ├── db/
│       │   │   ├── schema.ts
│       │   │   └── index.ts
│       │   └── middleware/
│       │       ├── auth.ts
│       │       └── rbac.ts
│       └── package.json
│
├── ui/                          # Standalone UI demo (Vite + React, port 5174)
├── playgrounds/
│   └── agents/                  # Agent Mission Control playground (real Claude Code sessions)
│       ├── server/              # Express + Socket.IO + Agent SDK
│       └── src/                 # React UI (Vite)
├── package.json                 # pnpm workspaces root
├── pnpm-workspace.yaml
├── ecosystem.config.cjs         # PM2
├── .env.example
└── CLAUDE.md
```

### Agent Spawn Flow (with Agent Mail + CM)

```
PM clicks "Start" on Epic
    │
    ▼
1. Scope Gate: analyze Epic → split if needed → PM confirm
    │
    ▼
2. Git: pull origin main → checkout -b epic/<slug> (must pull first to avoid stale base)
    │
    ▼
3. Agent Mail: register_agent(project, "claude", model, auto-name)
    │
    ▼
4. CM: cm_context(epic_description) → get relevant rules
    │
    ▼
5. CASS: cass search --robot "similar to <epic>" → past learnings
    │
    ▼
6. Spawn: query({ prompt, options: { model, cwd, permissionMode, ... } })
   via @anthropic-ai/claude-agent-sdk (NOT raw claude CLI)
    │
    ▼
7. Stream: parse NDJSON → store events → Socket.IO → UI
    │
    ▼
8. On AskUserQuestion: handle per config mode (pause/auto/hybrid)
    │
    ▼
9. Complete: push branch → gh pr create → spawn Code Review Agent
    │
    ▼
9b. Merge flow: gh pr merge --squash → pull main → br close → br sync → git commit .beads/ → git push
    (CRITICAL: must commit+push .beads/ after merge, otherwise team sees stale state)
    │
    ▼
10. Agent Mail: send_message(thread=epic_id, "PR ready for review")
    │
    ▼
11. CASS: cass index (index the completed session)
    │
    ▼
12. CM: cm_outcome(session_id, result) → update confidence
```

---

## Implementation Phases

### Phase 1: Foundation
- pnpm workspace monorepo (client + server)
- Docker Compose: Agent Mail + CM containers
- Express server + Drizzle/SQLite schema
- Vite + React + shadcn/ui scaffold
- 4-role auth (API key + session cookie)
- Socket.IO manager (rooms per epic/session, bidirectional events)
- Service wrappers: BeadsService, BvService, AgentManager, AgentMailClient, CmClient, CassService

### Phase 2: Capture + Triage + Epic Dashboard
- Capture page (`/captures`) with header CTA dialog (`Cmd+J`)
- AI-powered 4-phase triage (analyze → scope → criteria → Beads breakdown)
- Epic-first Kanban (dnd-kit, status columns, nested Beads)
- br integration for Epic/Bead CRUD

### Phase 3: Execution Engine
- "Start" → scope gate → git branch → Agent Mail register → CM context → CASS search → spawn
- Configurable concurrency + queue
- Live streaming panel (Socket.IO)
- AskUserQuestion 3-mode handling
- Agent lifecycle management

### Phase 4: Quality Gate
- Auto PR via `gh pr create`
- Code Review Agent auto-spawn
- Review Module UI (diff + AI comments)
- Feedback loop (comment → fix → push)
- Squash merge workflow

### Phase 5: Shared Memory + Notifications
- CM rules UI (TechLead management tab)
- Agent Mail thread viewer (monitor agent coordination)
- CASS session indexing post-completion
- Slack/Discord webhooks + in-app notifications

### Phase 6: Graph + Deployment
- bv dependency graph (React Flow + dagre)
- Cloudflare Tunnel setup for remote team access
- PM2 config for workspace app
- Dashboard polish, role-based views

---

## Quick Start

### Prerequisites

- macOS 14+ (Sonoma), Apple Silicon recommended
- Node.js 20+, pnpm 9+
- CLI tools: `claude`, `br`, `bv`, `cass`, `gh`, `git`
- Docker Desktop (for Agent Mail + CM, optional in dev)

### Setup

```bash
# Clone and install
git clone git@github.com:trungtnm/claude-team-ws.git
cd claude-team-ws
pnpm install

# Configure environment
cp .env.example .env
# Edit .env: set JWT_SECRET, ADMIN_EMAIL, ADMIN_API_KEY

# Start development
pnpm dev    # Express :3000 + Vite :5173
```

### UI Demo (Standalone)

The `ui/` directory contains a standalone UI demo that can be run independently without the backend:

```bash
cd ui
pnpm install
pnpm dev    # Vite dev server on :5174
```

### Verify

```bash
# Health check
curl http://localhost:3000/api/health

# Run tests
pnpm test              # 110+ unit tests
pnpm test:integration  # Integration tests (real SQLite)
pnpm test:e2e          # E2E tests (Playwright, auto-starts servers)
```

### Agent Mission Control Playground

```bash
cd playgrounds/agents
npm install
npm run dev    # Express :3001 + Vite :5175
```

Open http://localhost:5175 to spawn and interact with Claude Code sessions.

---

## Development Guide

### Testing Strategy

| Layer | Tool | Command | Scope |
|-------|------|---------|-------|
| Unit | Vitest | `pnpm test` | Services, middleware, utilities |
| Integration | Vitest + supertest | `pnpm test:integration` | Routes with real SQLite DB |
| E2E | Playwright | `pnpm test:e2e` | Full browser flows |

**Integration tests** use in-memory SQLite via `createTestDb()` from `packages/server/src/db/test-db.ts`. Each test file gets a fresh schema; `cleanAllTables()` resets data between tests.

**E2E tests** auto-start the dev server via Playwright's `webServer` config. Write specs in `packages/client/e2e/`.

### Adding a New Feature

1. Create a bead: `br create --actor assistant "Feature title" -t task -p 1`
2. Backend: add route in `packages/server/src/routes/`, service in `services/`
3. Write integration test: `*.integration.test.ts` using `createTestDb()`
4. Frontend: add page/component, TanStack Query hook, socket listener
5. Write E2E test in `packages/client/e2e/`
6. Emit Socket.IO events from route mutations
7. Close bead: `br close <id> --reason "Done"` + `br sync --flush-only`

### Adding a New API Route

```typescript
// packages/server/src/routes/my-resource.ts
import { Router } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { emitToProject } from '../services/socket-manager.js'

const router = Router()
router.use(authenticate)

// Validate with zod, emit socket events on mutations
router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
  }
  // ... insert into DB ...
  emitToProject(projectId, 'resource:created', result)
  res.status(201).json({ resource: result })
})

export default router
```

### Project Tracking

This project uses [Beads Rust](https://github.com/beads-rs/beads) (`br`) for issue tracking with prefix `ctw`:

```bash
br ready --json          # What's unblocked and actionable
br list --json           # All open issues
bv --robot-triage        # AI-powered triage with dependency analysis
bv --robot-plan          # Parallel execution tracks
```
