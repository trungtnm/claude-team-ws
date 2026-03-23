# Approach — Phases 2-6

## Selected Strategy

**Integration-first with parallel tracks.** The foundation exists (services, schema, routes). The work is primarily wiring services into routes, emitting socket events, and building frontend UI against live APIs.

## Prerequisite: Foundation Fix

Before any phase, fix the client API layer:
- `lib/api.ts` paths mismatch server routes (client: `/projects/:id/epics`, server: `/api/epics?project_id=X`)
- `lib/api.ts` types don't match server schema (client has `Epic.title`, server has `epics.bead_epic_id`)
- `lib/socket.ts` event names wrong (`join`/`leave` vs `join:project`/`join:session`)

## Phase Ordering & Parallelization

```
Foundation Fix (F) ─────────────────────────────────────────────>
                    │
Phase 2 Backend ────┤──── Phase 2 Frontend ─────────────────────>
                    │                        │
Phase 3 Spikes ─────┤                        │
Phase 3 Backend ────┤──── Phase 3 Frontend ──┤──────────────────>
                    │                        │
                    │    Phase 4 Backend ─────┤── Phase 4 Frontend
                    │                        │
                    │    Phase 5 (parallel) ──┤── Phase 5 Frontend
                    │                        │
                    │    Phase 6 (parallel) ──┤── Phase 6 Frontend
```

## Risk Map

| Component | Risk | Action |
|-----------|------|--------|
| API client fix | LOW | Proceed |
| Socket.IO wiring | LOW | Proceed |
| Capture Inbox UI | LOW | Proceed |
| Epic Kanban (dnd-kit) | MEDIUM | Design DnD data model first |
| AgentQueue | MEDIUM | Use SQLite transactions |
| ContextBuilder | MEDIUM | Error boundaries per source |
| NDJSON Stream + Socket | MEDIUM | Proceed (parsing exists) |
| **Stdin piping for Q&A** | **HIGH** | **Spike needed** |
| **Crash Recovery** | **HIGH** | **Spike needed** |
| **CM MCP API surface** | **MEDIUM** | Verify capabilities |
| gh CLI PR creation | LOW | Proceed |
| Code Review Agent | MEDIUM | Design prompt first |
| React Flow Graph | LOW | Proceed |
| Cloudflare Tunnel | LOW | Config-only |

## HIGH Risk Items (Spike Required)

### Spike 1: Claude CLI stdin/stdout Q&A protocol
- **Question**: How does claude `--output-format=stream-json` handle AskUserQuestion? What NDJSON event type appears? How does stdin accept the answer?
- **Impact**: Blocks entire Q&A feature in Phase 3
- **Approach**: Spawn claude manually, trigger a question, observe protocol

### Spike 2: Crash recovery PID monitoring
- **Question**: Does `process.kill(pid, 0)` work reliably on macOS? Where are session logs stored? Can we reconstruct events from ~/.claude/?
- **Impact**: Blocks crash recovery in Phase 3
- **Approach**: Test PID monitoring + session log reading in isolation

## Decomposition Summary

| Phase | Backend | Frontend | Spikes | Total Beads |
|-------|:-------:|:--------:|:------:|:-----------:|
| Foundation Fix | 1 | 1 | 0 | 2 |
| Phase 2 | 3 | 7 | 0 | 10 |
| Phase 3 | 6 | 4 | 2 | 12 |
| Phase 4 | 4 | 3 | 0 | 7 |
| Phase 5 | 4 | 3 | 0 | 7 |
| Phase 6 | 1 | 2 | 2 | 5 |
| **Total** | **19** | **20** | **4** | **43** |

## Key Decisions

1. **Fix API client before features** — every frontend bead depends on correct API paths/types
2. **Phase 3 backend first** — it's the highest-risk, longest-path piece; start early
3. **Spikes for Q&A and crash recovery** — external dependencies that can't be designed without testing
4. **Phases 5 & 6 parallel with Phase 4** — they're mostly independent CRUD + config work
5. **Single repo pattern for now** — multi-repo support exists in schema but defer complex multi-repo merge coordination

## Caveats

1. CM MCP server API surface unknown — may need additional methods beyond getContext/recordOutcome
2. Claude CLI stdin protocol undocumented in codebase — spike essential
3. activity_log action enum needs expanding (missing session_failed, pr_review_started, etc.)
4. Multi-repo spawn (--add-dir for N repos) designed but UI for repo selection not yet planned
