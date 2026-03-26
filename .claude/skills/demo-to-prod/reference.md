# Demo-to-Prod Quick Reference

## Demo File → Production Target Mapping

### Pages
| Demo File | Production Target | API Dependencies |
|-----------|-------------------|-----------------|
| `ui/src/pages/board-page.tsx` | `packages/client/src/pages/board-page.tsx` | `GET/POST/PATCH /api/projects/:id/epics` |
| `ui/src/pages/captures-page.tsx` | `packages/client/src/pages/captures-page.tsx` | `GET/POST /api/projects/:id/captures`, `POST .../triage` |
| `ui/src/pages/agents-page.tsx` | `packages/client/src/pages/agents-page.tsx` | `GET/POST /api/projects/:id/sessions` |
| `ui/src/pages/agent-stream-page.tsx` | `packages/client/src/pages/agent-stream-page.tsx` | Socket.IO `session:<id>` room |
| `ui/src/pages/graph-page.tsx` | `packages/client/src/pages/graph-page.tsx` | `GET /api/projects/:id/graph` (bv) |
| `ui/src/pages/settings-page.tsx` | `packages/client/src/pages/settings-page.tsx` | Multiple settings endpoints |
| `ui/src/pages/pr-review-page.tsx` | `packages/client/src/pages/pr-review-page.tsx` | `GET /api/projects/:id/reviews` (gh) |

### Mock Data → Query Hooks
| Demo Import | Replace With | Query Key |
|-------------|-------------|-----------|
| `@/data/epics` | `useEpics(projectId)` | `['projects', id, 'epics']` |
| `@/data/captures` | `useCaptures(projectId)` | `['projects', id, 'captures']` |
| `@/data/sessions` | `useSessions(projectId)` | `['projects', id, 'sessions']` |
| `@/data/beads` | `useBeads(projectId)` | `['projects', id, 'beads']` |
| `@/data/users` | `useMembers(projectId)` | `['projects', id, 'members']` |
| `@/data/repos` | `useRepos(projectId)` | `['projects', id, 'repos']` |
| `@/data/rules` | `useRules(projectId)` | `['projects', id, 'rules']` |
| `@/data/graph-nodes` | `useGraph(projectId)` | `['projects', id, 'graph']` |
| `@/data/notifications` | `useNotifications()` | `['notifications']` |
| `@/data/webhooks` | `useWebhooks(projectId)` | `['projects', id, 'webhooks']` |
| `@/data/pr-review` | `usePrReview(projectId, prId)` | `['projects', id, 'reviews', prId]` |
| `@/data/agent-stream` | Socket.IO live events | N/A (real-time) |

### Zustand Store Disposition
| Store | Keep/Replace | Reason |
|-------|-------------|--------|
| `board-store.ts` | **Replace** — server data (epics, columns) → TanStack Query | Only keep UI filter state |
| `agent-store.ts` | **Replace** — sessions → TanStack Query + Socket.IO | Only keep UI selections |
| `capture-store.ts` | **Replace** — captures → TanStack Query | Only keep composer open/close state |
| `app-store.ts` | **Keep** — pure UI state (sidebar, theme) | Already correct pattern |

### Data Shape Mismatches to Resolve
| Entity | Demo Field | Production Resolution |
|--------|-----------|----------------------|
| `User` | `initials`, `color` | Compute from `name` and `id` in API response |
| `Capture` | Missing `project_id`, `triage_result` | Add to API response, not needed in list view |
| `Epic` | `sourceCaptures` denormalized | Separate fetch or join in API |
| `AgentSession` | `epicTitle`, `beadTitle` | Join/lookup in API response |
| `AgentSession` | `tokensUsed`, `contextWindowPercent`, `costUsd` | Ephemeral from Socket.IO events, not DB |
| `Bead` | `epicId` | Via `epics.bead_epic_id` in app DB |
| `WebhookConfig` | `telegram` type | DB only has `slack`/`discord` — add telegram or remove from UI |

### Playground Code to Copy
| Playground File | Production Target | What It Provides |
|----------------|-------------------|-----------------|
| `playgrounds/agents/server/session-manager.ts` | `packages/server/src/services/agent-service.ts` | Agent SDK query(), AskUserQuestion handling, session lifecycle |
| `playgrounds/agents/server/types.ts` | `packages/server/src/types/agent.ts` | Session/event type definitions |
| `playgrounds/agents/src/hooks/use-sessions.ts` | `packages/client/src/hooks/use-sessions.ts` | TanStack Query + Socket.IO pattern |
| `playgrounds/agents/src/lib/api.ts` | `packages/client/src/lib/api.ts` | Typed fetch wrapper pattern |
| `playgrounds/agents/src/lib/socket.ts` | `packages/client/src/lib/socket.ts` | Socket.IO client manager |
| `playgrounds/agents/src/components/agents/*` | Merge with `packages/client/src/components/agents/` | Rich input, stream events, stats bar |

## Multi-Agent Coordination

### Agent Mail File Reservations per Page

| Page Agent | Exclusive Reservations | Shared (non-exclusive) |
|-----------|----------------------|----------------------|
| **BoardAgent** | `packages/client/src/pages/board-page.tsx`, `packages/client/src/components/board/**`, `packages/client/src/hooks/use-epics*` | `lib/query-keys.ts`, `lib/api.ts` |
| **CapturesAgent** | `packages/client/src/pages/captures-page.tsx`, `packages/client/src/components/capture/**`, `packages/client/src/hooks/use-captures*` | `lib/query-keys.ts`, `lib/api.ts` |
| **AgentsAgent** | `packages/client/src/pages/agents-page.tsx`, `packages/client/src/pages/agent-stream-page.tsx`, `packages/client/src/components/agents/**`, `packages/client/src/hooks/use-sessions*` | `lib/query-keys.ts`, `lib/api.ts`, `lib/socket.ts` |
| **SettingsAgent** | `packages/client/src/pages/settings-page.tsx`, `packages/client/src/components/settings/**`, `packages/client/src/hooks/use-settings*` | `lib/query-keys.ts`, `lib/api.ts` |
| **GraphAgent** | `packages/client/src/pages/graph-page.tsx`, `packages/client/src/components/graph/**`, `packages/client/src/hooks/use-graph*` | `lib/query-keys.ts`, `lib/api.ts` |
| **PRReviewAgent** | `packages/client/src/pages/pr-review-page.tsx`, `packages/client/src/components/pr-review/**`, `packages/client/src/hooks/use-pr-review*` | `lib/query-keys.ts`, `lib/api.ts` |
| **NotificationsAgent** | `packages/client/src/components/layout/notification-dropdown.tsx`, `packages/client/src/hooks/use-notifications*` | `lib/query-keys.ts`, `lib/api.ts`, `lib/socket.ts` |

### Recommended Agent Groupings (3-4 parallel sessions)

Grouping pages to minimize agent count while keeping work balanced:

| Session | Pages | Estimated Weight | Rationale |
|---------|-------|-----------------|-----------|
| **Agent 1** | Board + Captures | Heavy | Related domains (epics ↔ captures triage), most complex CRUD |
| **Agent 2** | Agents + Stream + Notifications | Heavy | All use Socket.IO heavily, playground code to copy |
| **Agent 3** | Settings (5 tabs) + Graph | Medium | Independent pages, settings has breadth |
| **Agent 4** | PR Review | Light | Single page but complex (GitHub API, diff rendering) |

### Phase 4 Agent Startup Checklist

Each parallel agent session MUST do these steps on startup:

```bash
# 1. Register with Agent Mail
# (use MCP tool: ensure_project + register_agent)

# 2. Read current state
bv --robot-triage --format toon          # See available beads
br list --status=open --label=frontend   # Page beads from Phase 3

# 3. Claim a bead
br update <bead-id> --status in_progress

# 4. Reserve files (via Agent Mail MCP tool)
# file_reservation_paths(project_key, agent_name, [...exclusive_paths], ttl_seconds=3600, exclusive=true)

# 5. Read the skill
# /demo-to-prod <page-name>

# 6. After completion
br close <bead-id> --reason "Wired <page> to production API"
# release_file_reservations via Agent Mail
# send_message to project thread
br sync --flush-only
```

### Post-Phase-4 Review Pipeline

After all page agents finish:

```bash
# In a single session:
/t:peer-review     # Spawns 3 parallel subagents: security, server, client review
/t:fresh-eyes      # Re-reads all modified files with fresh perspective
/t:polish          # UI/UX sweep for premium quality
/t:commit          # Groups changes logically into commits
```

### Host Services (NOT Docker)

| Service | Host | Default Port |
|---------|------|-------------|
| Agent Mail | localhost | 3001 (or configured) |
| CM (Cass Memory) | localhost | 3002 (or configured) |
| CASS | localhost | CLI tool |
| Express API Server | localhost | 3000 |
| Vite Dev Server | localhost | 5173 |
