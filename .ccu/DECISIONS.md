# Architectural Decisions

## 2026-03-27: Agent Session Auth — Hybrid API Key Strategy

**Decision:** Agent sessions use a hybrid auth approach for calling server APIs:
- **User-triggered sessions** (triage, manual agent runs): Pass the starting user's `api_key` as `CTW_API_KEY`. Actions are attributed to that user in audit logs.
- **Background/system tasks** (scheduled jobs, auto-triage, maintenance): Use a dedicated `agent-bot` system user with its own API key. Actions attributed to the bot user.

**Why:** Need clear audit trail for user-initiated work (who triaged what, who approved which PR) while background tasks shouldn't impersonate any real user. A single approach doesn't cover both — user keys give traceability, bot key gives clean separation for autonomous work.

**Implementation:**
- Session runner reads `user.api_key` from DB for user-triggered sessions, passes as `CTW_API_KEY` env var
- Seed script creates an `agent-bot` user (role: `system`) with a dedicated API key
- `CTW_API_KEY` in `.env` is the bot key — used only for background/system tasks
- Session table's `user_id` already tracks who started each session

## 2026-03-27: Replace Graph Page with Activity + Metrics Page

**Decision:** Replace the dependency graph page (`/graph`) with an Activity page that combines a real-time activity feed and project metrics in a split-view layout (45% feed / 55% metrics).

**Why:** The graph page (dependency visualization via ReactFlow) is a "look once" tool — not something the team checks daily. An activity + metrics page gives the team an operational homepage: what's happening now, project health at a glance, and capture/epic/PR pipeline status.

**Layout:** Split view chosen over stacked (metrics too compressed), tabbed (hides half the value), and combined/timeline (too narrow for metrics). Feed at 45% keeps it scannable; metrics at 55% gets enough room for cards, progress bars, and pipeline views.

**Data fetching:** TanStack Query polling (30s interval + window focus refetch). No Socket.IO for v1 — simpler, and the real-time event infrastructure is already in place for a future upgrade.

**Graph page:** Kept but unlinked from nav/routing. Files preserved for potential reuse (e.g. as an embeddable widget).
