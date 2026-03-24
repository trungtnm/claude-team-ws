# claude-team-ws — Kickoff Document

> **IMPORTANT NOTE:** claude-team-ws is a **completely new project** with its own repo. It does not live inside or depend on claude-code-utils (ccu). This doc set was originally stored in the ccu repo only because that's where brainstorming took place. When kicking off, create a new repo from scratch.
>
> Concepts from ccu (br, bv, orchestrator, agent mail, CASS, CM, etc.) are only used as **reference for CLI commands and integration patterns** — no code is imported from, and there is no dependency on, ccu.

## Overview

Semi-Auto Epic-Driven Dev Workspace for development teams. Runs on Mac Mini, accessed via Cloudflare Tunnel.

## Documents

| # | File | Contents |
|---|------|----------|
| 00 | `00-kickoff-readme.md` | **You are reading this file** — Overview and kickoff guide |
| 01 | `01-database-schema.md` | Detailed database schema (app SQLite + Beads reference) |
| 02 | `02-api-specification.md` | REST API routes + request/response formats |
| 03 | `03-infrastructure-setup.md` | Docker Compose, PM2, Cloudflare Tunnel, host requirements |
| 04 | `04-socket-io-events.md` | Socket.IO events, rooms, real-time communication protocol |
| 05 | `05-ui-wireframes.md` | ASCII wireframes for all pages + component specs |
| 06 | `06-agent-lifecycle.md` | Agent spawn → stream → complete → PR → review → merge flow |
| 07 | `07-dependencies.md` | Package.json for the monorepo + version pinning |
| 08 | `08-project-claude-md.md` | Template CLAUDE.md for projects |
| 09 | `09-umbrella-repo-workflow.md` | Umbrella repo pattern: 2-tier git, beads sync, conflict resolution |
| — | `plan.md` | Original architecture plan (5 Pillars, decisions, phases) |

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

### Phase 1: Foundation (~3 days) — Mostly Complete
- [x] Init pnpm monorepo (client + server)
- [x] Docker Compose: Agent Mail + CM
- [x] Express server + Drizzle schema + migrations
- [x] Vite + React + shadcn/ui scaffold
- [x] 4-role auth (API key + JWT session)
- [x] Socket.IO setup (rooms, auth middleware)
- [x] Service wrappers: BeadsService, BvService, AgentManager, AgentMailClient, CmClient, CassService
- [x] Health check on startup (verify all CLI tools + Docker services)
- [x] Unit tests + integration test infrastructure

### Phase 2: Capture + Triage + Epic Dashboard (~3 days)
- [ ] Captures page (full-page view with pending/deferred tabs)
- [ ] Visual triage UI (4-phase AI-assisted flow to Epic creation)
- [ ] Epic-first Kanban board (dnd-kit, 5 columns: Blocked/Ready/In Prog/In Review/Done)
- [ ] Epic side panel (details, nested beads, sessions, git)
- [ ] br integration for Epic/Bead CRUD
- [ ] Socket.IO events for board updates

### Phase 3: Execution Engine (~3 days)
- [ ] "Start Agent Session" → scope gate → git branch → spawn
- [ ] Agent context building (CM rules + CASS learnings)
- [ ] NDJSON stream parsing + Socket.IO broadcast
- [ ] Agent stream UI (terminal-like view)
- [ ] AskUserQuestion 3-mode handling
- [ ] Concurrency limit + queue management
- [ ] Cancel/resume session

### Phase 4: Quality Gate (~2 days)
- [ ] Auto push + PR creation via `gh`
- [ ] Code Review Agent auto-spawn
- [ ] PR Review Module UI (diff + AI comments side-by-side)
- [ ] Human comment → agent fix → push feedback loop
- [ ] Squash merge workflow
- [ ] Branch cleanup post-merge

### Phase 5: Shared Memory + Notifications (~2 days)
- [ ] CM rules management UI (TechLead tab)
- [ ] Agent Mail thread viewer
- [ ] CASS session indexing post-completion
- [ ] Slack/Discord webhook notifications
- [ ] In-app notification bell + badge
- [ ] Browser push notifications

### Phase 6: Graph + Deployment (~2 days)
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
