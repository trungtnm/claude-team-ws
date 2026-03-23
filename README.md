# Claude Team Workspace — Semi-Auto Epic-Driven Dev Workspace

## Context

Xây dựng workspace chung cho team dev trên Mac Mini host. PM/Dev capture ý tưởng, triage thành Epics, trigger Agent sessions, review qua PR workflow.

**Project hoàn toàn mới** — repo riêng, không phụ thuộc claude-code-utils. Tích hợp với br, bv, CASS, CM, Agent Mail như external CLI/services (tham khảo ccu docs cho command patterns, không import code).

---

## Architecture Decisions (Finalized)

| Quyết định | Lựa chọn |
|---|---|
| **Stack** | Vite + React (SPA) + Express (API) + SQLite (Drizzle) + Socket.IO |
| **Epic scope sizing** | Auto-detect + PM confirm |
| **Concurrency** | N agents/project (configurable). Queue khi full |
| **Role model** | 4 roles: PM / Dev / TechLead / Viewer |
| **Git strategy** | 1 branch/Epic, squash merge vào main |
| **Notifications** | In-app + Slack/Discord webhook |
| **AskUserQuestion** | Configurable 3 modes: pause, auto-decide, hybrid |
| **Workspace model** | 1 workspace = 1 project. Multi-repo, shared 1 Beads DB |
| **Cost tracking** | Không track trong UI |
| **Host** | Mac Mini, serving via Cloudflare Tunnel |
| **Infrastructure** | Docker Compose cho Agent Mail + CM. CASS + br + bv native trên host |

---

## Infrastructure Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Mac Mini Host                     │
│                                                      │
│  ┌─── Docker Compose ────────────────────────────┐  │
│  │                                                │  │
│  │  agent-mail (Python MCP)     :8765            │  │
│  │  ├─ Message broker cho multi-agent             │  │
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
│  Cloudflare Tunnel ──── team truy cập remote ──────> │
└─────────────────────────────────────────────────────┘
```

### Tại sao Docker cho Agent Mail + CM, native cho phần còn lại?

- **Agent Mail** (Python MCP server): Service chạy liên tục, cần isolated Python env, persistent message store. Docker đảm bảo clean restart, volume mount cho data
- **CM** (Bun/TS MCP server): Service chạy liên tục trên port 9900, cần persistent playbook/rules. Docker isolation + restart policy
- **CASS**: CLI tool thuần (Rust binary), không cần server. Gọi on-demand từ workspace app
- **br/bv**: CLI tools, gọi qua `execFile`. Cần access filesystem trực tiếp (`.beads/` trong project)
- **claude CLI**: Spawn OS process, cần access host filesystem + đã authenticated sẵn. Docker sẽ phức tạp hóa
- **Workspace app**: Chạy native để dễ access filesystem, spawn processes, debug. PM2 cho auto-restart

---

## 5 Pillars

### 1. Epic-Driven Dashboard (Capture → Triage → Epic)

- **Capture Inbox**: Sidebar persistent, team throw ideas qua web, attributed by user
- **Visual Triage**: Drag capture → tạo Epic. UI enrich (1-3 questions)
- **Epic-First Kanban**: Epics là unit chính. Click → nested Beads
- **Auto-Detect Split**: Click "Start" → analyze scope → đề xuất Beads → PM confirm
- **Status flow**: `Draft → Ready → In Progress → In Review → Done`
- **Multi-repo, shared Beads**: 1 project nhiều repos, share 1 Beads DB

### 2. Semi-Auto Execution Engine

- **Trigger**: PM/Dev click "Start Agent Session" trên Epic card
- **Scope Gate**: Auto-analyze → split proposal → PM confirm
- **Git Isolation**: `git checkout -b epic/<slug>` per repo
- **Configurable Concurrency**: Admin set max. Queue với priority ordering
- **Context Injection**: Worker nhận: Epic desc, AC, CM rules, CASS learnings
- **Live Tracking**: Socket.IO streaming real-time trong Epic panel
- **AskUserQuestion 3 modes** (configurable per project)

### 3. Quality Gate: PR → AI Review → Human Merge

- **Auto PR**: Agent done → push → `gh pr create`
- **AI Peer Review**: Auto-spawn Code Review Agent (UBS + Security + Standards)
- **Human Review Module**: Diff + AI comments side-by-side
- **Feedback Loop**: Human comment → Worker fix → push → lặp
- **Merge**: PM/TechLead squash merge → close Epic → update Beads

### 4. Shared Memory Hub (CASS + CM + Agent Mail)

- **Agent Mail** (Docker, port 8765): Message broker cho multi-agent coordination
  - Workers register khi spawn: `register_agent(project, "claude", model, agent_name)`
  - Epic ID = thread_id: mọi messages trong Epic liên kết
  - File reservations: prevent merge conflicts giữa concurrent agents
  - Orchestrator poll inbox: monitor worker progress, detect blockers
- **CASS** (native CLI): Index sessions, semantic search
  - `cass index` sau mỗi session complete
  - Worker query `cass search --robot "similar problem"` trước khi bắt đầu Epic
  - Hybrid search: BM25 lexical + MiniLM vector
- **CM** (Docker, port 9900): Team procedural memory
  - Tab "Team Rules" trong UI. TechLead manage
  - Worker call `cm_context` khi spawn → get relevant rules
  - Code Review reject → `cm_feedback --harmful` → auto-synthesize rule
  - 90-day confidence decay. Anti-pattern learning (4x harmful multiplier)
  - Project-level rules (`.cass/playbook.yaml`) + global rules

### 5. Dependency Graph (bv-powered)

- **React Flow** graph từ `bv --robot-plan`
- **Color**: Red=Critical Path, Orange=Bottleneck, Green=Ready
- **PM Decision Aid**: Visual guide chọn Epic nào trigger tiếp

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
│   │   │   │   ├── capture/     # Capture inbox sidebar
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
2. Git: pull origin main → checkout -b epic/<slug> (PHẢI pull trước để tránh stale base)
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
6. Spawn: claude -p --output-format=stream-json \
     --model <model> --session-id <uuid> \
     --add-dir <repo-path> \
     "<epic prompt + CM rules + CASS learnings>"
     (KHÔNG dùng --bare: giữ session persistence cho CASS indexing)
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
    (CRITICAL: phải commit+push .beads/ sau merge, nếu không team thấy stale state)
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
- Capture inbox sidebar (persistent, live, attributed)
- Visual triage (drag → Epic with enrichment)
- Epic-first Kanban (dnd-kit, status columns, nested Beads)
- br integration cho Epic/Bead CRUD

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
