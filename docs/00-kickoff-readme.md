# claude-team-ws — Kickoff Document

> **LƯU Ý QUAN TRỌNG:** claude-team-ws là một **project hoàn toàn mới**, repo riêng, không nằm trong và không phụ thuộc vào claude-code-utils (ccu). Bộ docs này được lưu trong ccu repo chỉ vì đây là nơi brainstorm diễn ra. Khi kick off, tạo repo mới từ đầu.
>
> Các khái niệm từ ccu (br, bv, orchestrator, agent mail, CASS, CM...) chỉ mang tính **tham khảo về CLI commands và integration patterns** — không import code, không depend vào ccu.

## Tổng quan

Semi-Auto Epic-Driven Dev Workspace cho team dev. Chạy trên Mac Mini, truy cập qua Cloudflare Tunnel.

## Documents

| # | File | Nội dung |
|---|------|---------|
| 00 | `00-kickoff-readme.md` | **Bạn đang đọc file này** — Tổng quan và hướng dẫn kickoff |
| 01 | `01-database-schema.md` | Database schema chi tiết (app SQLite + Beads reference) |
| 02 | `02-api-specification.md` | REST API routes + request/response formats |
| 03 | `03-infrastructure-setup.md` | Docker Compose, PM2, Cloudflare Tunnel, host requirements |
| 04 | `04-socket-io-events.md` | Socket.IO events, rooms, real-time communication protocol |
| 05 | `05-ui-wireframes.md` | ASCII wireframes cho mọi page + component specs |
| 06 | `06-agent-lifecycle.md` | Agent spawn → stream → complete → PR → review → merge flow |
| 07 | `07-dependencies.md` | Package.json cho cả monorepo + version pinning |
| 08 | `08-project-claude-md.md` | Template CLAUDE.md cho project |
| 09 | `09-umbrella-repo-workflow.md` | Umbrella repo pattern: 2-tier git, beads sync, conflict resolution |
| — | `plan.md` | Architecture plan gốc (5 Pillars, decisions, phases) |

## Architecture Summary

```
Browser ◄──Socket.IO──► Express API ──spawn──► claude CLI
                            │
                            ├── br CLI (Beads — issues)
                            ├── bv CLI (graph analysis)
                            ├── cass CLI (session search)
                            ├── gh CLI (PR management)
                            │
                            ├── Agent Mail (Docker :8765)
                            └── CM Memory (Docker :9900)
```

## Key Decisions

| Decision | Choice |
|----------|--------|
| Stack | Vite + React + Express + SQLite + Socket.IO |
| Issue Tracker | Beads Rust (`br`) — source of truth |
| Real-time | Socket.IO (bidirectional) |
| Agent Spawning | `claude` CLI via `child_process.spawn` |
| Git Strategy | 1 branch/Epic, squash merge |
| Roles | PM / Dev / TechLead / Viewer |
| Infrastructure | Docker (Agent Mail + CM) + Native (workspace app + CLI tools) |
| Host | Mac Mini + Cloudflare Tunnel |

## Implementation Phases

### Phase 1: Foundation (~3 ngày)
- [ ] Init pnpm monorepo (client + server)
- [ ] Docker Compose: Agent Mail + CM
- [ ] Express server + Drizzle schema + migrations
- [ ] Vite + React + shadcn/ui scaffold
- [ ] 4-role auth (API key + JWT session)
- [ ] Socket.IO setup (rooms, auth middleware)
- [ ] Service wrappers: BeadsService, BvService, AgentManager, AgentMailClient, CmClient, CassService
- [ ] Health check on startup (verify all CLI tools + Docker services)

### Phase 2: Capture + Triage + Epic Dashboard (~3 ngày)
- [ ] Capture inbox sidebar (persistent, live, attributed)
- [ ] Visual triage UI (drag → Epic creation with enrichment)
- [ ] Epic-first Kanban board (dnd-kit, 5 columns)
- [ ] Epic side panel (details, nested beads, sessions, git)
- [ ] br integration for Epic/Bead CRUD
- [ ] Socket.IO events cho board updates

### Phase 3: Execution Engine (~3 ngày)
- [ ] "Start Agent Session" → scope gate → git branch → spawn
- [ ] Agent context building (CM rules + CASS learnings)
- [ ] NDJSON stream parsing + Socket.IO broadcast
- [ ] Agent stream UI (terminal-like view)
- [ ] AskUserQuestion 3-mode handling
- [ ] Concurrency limit + queue management
- [ ] Cancel/resume session

### Phase 4: Quality Gate (~2 ngày)
- [ ] Auto push + PR creation via `gh`
- [ ] Code Review Agent auto-spawn
- [ ] PR Review Module UI (diff + AI comments side-by-side)
- [ ] Human comment → agent fix → push feedback loop
- [ ] Squash merge workflow
- [ ] Branch cleanup post-merge

### Phase 5: Shared Memory + Notifications (~2 ngày)
- [ ] CM rules management UI (TechLead tab)
- [ ] Agent Mail thread viewer
- [ ] CASS session indexing post-completion
- [ ] Slack/Discord webhook notifications
- [ ] In-app notification bell + badge
- [ ] Browser push notifications

### Phase 6: Graph + Deployment (~2 ngày)
- [ ] bv dependency graph (React Flow + dagre layout)
- [ ] Critical path + bottleneck visualization
- [ ] Cloudflare Tunnel production setup
- [ ] PM2 ecosystem config
- [ ] Role-based dashboard views

## Quick Start (Development)

```bash
# 1. Clone repo
git clone <repo-url> claude-team-ws
cd claude-team-ws

# 2. Install dependencies
pnpm install

# 3. Setup environment
cp .env.example .env
# Edit .env with your values

# 4. Start infrastructure
pnpm docker:up

# 5. Run migrations
pnpm db:migrate

# 6. Start dev servers
pnpm dev

# 7. Open browser
open http://localhost:5173
```

## Prerequisites Checklist

- [ ] Mac Mini with macOS 14+
- [ ] Node.js 20+ (via nvm)
- [ ] pnpm 9+
- [ ] Docker Desktop
- [ ] `claude` CLI installed and authenticated
- [ ] `br` CLI installed (`br --version`)
- [ ] `bv` CLI installed (`bv --version`)
- [ ] `cass` CLI installed (`cass --version`)
- [ ] `gh` CLI installed and authenticated
- [ ] Cloudflare account (for tunnel)
- [ ] Domain name (for remote access)
