# Agents Page — Agent Mission Control (`/agents` + `/agents/:sessionId`)

## Overview

| Attribute | Value |
|-----------|-------|
| Routes | `/agents` (split-panel mission control), `/agents/:sessionId` (full-view stream) |
| Page components | `pages/agents-page.tsx`, `pages/agent-stream-page.tsx` |
| Store | `stores/agent-store.ts` (Zustand) — minimal, mostly unused |
| Mock data | `data/sessions.ts`, `data/agent-stream.ts`, `data/users.ts` |
| API endpoints | `GET /api/projects/:projectId/sessions`, `GET /api/sessions/:sessionId`, `GET /api/sessions/:sessionId/events`, `POST /api/projects/:projectId/sessions`, `POST /api/sessions/:sessionId/cancel`, `POST /api/sessions/:sessionId/answer`, `POST /api/sessions/:sessionId/resume` |
| Socket.IO events | `session:event`, `session:question`, `session:question:answered`, `session:progress`, `session:lifecycle`, `queue:updated` |

---

## Component Tree

### Split-panel view (`/agents`)

```
AgentsPage
├── Top bar (title + live counters + "New Session" button)
└── Split panel
    ├── Left panel (w-80, session list)
    │   ├── Filter tabs (Active | Queued | History)
    │   ├── Search input
    │   └── SessionListItem (x N)
    │       └── LiveDuration (for active sessions)
    └── Right panel (flex-1, session detail)
        ├── Session header (agent name, model, status, live duration)
        │   ├── Context window gauge
        │   ├── Token/cost counters
        │   └── Epic/bead context links
        ├── Waiting input banner (conditional)
        ├── AgentStreamView
        │   └── StreamEvent (x N)
        ├── SessionStatsBar
        └── AskQuestionDialog (overlay)
```

### Full-view stream (`/agents/:sessionId`)

```
AgentStreamPage
├── Header (back link, agent name, status badge, cancel button)
│   └── Epic/bead context links
├── AgentStreamView
│   └── StreamEvent (x N)
├── SessionStatsBar
└── AskQuestionDialog (overlay)
```

---

## Components

### `AgentsPage` — `pages/agents-page.tsx`

**State:**
- Local: `searchQuery`, `activeTab: 'active' | 'queued' | 'history'`, `selectedSessionId`, `questionOpen`
- Note: Does NOT use `useAgentStore` — manages selection locally

**Data:**
- `sessions` from `data/sessions.ts` (mock)
- Categorized via `getSessionsByStatus()`: running, waiting_input, queued, completed, failed

**Auto-select behavior:** On mount (and when `selectedSessionId` is null), auto-selects the first session from `[...waiting, ...running]` — prioritizing sessions needing input.

**Layout:**

#### Top bar
- Title "Agents"
- Live counters: animated green dot + "N active", "N queued", "max 3 concurrent"
- "New Session" button (demo-only toast)

#### Left panel (w-80)
- **Filter tabs:** Active (running + waiting), Queued, History (completed + failed)
- **Search input:** Filters by `epicTitle`, `agentName`, `beadTitle`
- **Session list:** `SessionListItem` components, scrollable

#### Right panel
- **Empty state:** Bot icon + "Select a session to view its stream"
- **When session selected:** Header + optional waiting banner + `AgentStreamView` + `SessionStatsBar`

**Session header (right panel):**
- Agent name, model badge, status badge, live duration counter
- Full View button → navigates to `/agents/:sessionId`
- Cancel button (running/waiting_input only)
- Context window gauge (inline bar chart with color thresholds)
- Token count, cost (USD), turns, files modified
- Epic title link (LinkIcon), bead title (ArrowRight), PR number (conditional)

**Waiting input banner:**
- Amber background, AlertTriangle icon
- Shows question text + context
- "Answer" button opens `AskQuestionDialog`

---

### `SessionListItem` — inline in `agents-page.tsx`

**Props:**
```typescript
{
  session: AgentSession
  selected: boolean
  onClick: () => void
}
```

**Conditional rendering by status:**

| Status | Visual elements |
|--------|----------------|
| `running` | Green pulsing dot, live duration counter, turns, files, cost, last action (monospace), context window gauge |
| `waiting_input` | Amber pulsing dot, amber background when not selected, question preview (1-line truncated), live duration, context window gauge |
| `queued` | Gray dot, queue position "#N", requester name |
| `completed` | Green dot (no pulse), duration, turns, PR link with status badge |
| `failed` | Red dot, duration, turns, "Error" label |

**Layout (top to bottom):**
1. Agent name (or "Queue #N") + status badge
2. Epic title (truncated)
3. Bead title with arrow prefix (conditional)
4. Stats row (varies by status)
5. Context window gauge bar (active only)
6. Question preview (waiting_input only)
7. Last action monospace (running only)

---

### `AgentStreamView` — `components/agents/agent-stream-view.tsx`

**Props:**
```typescript
interface AgentStreamViewProps {
  sessionId: string
}
```

**Data:**
- `streamEvents` from `data/agent-stream.ts` — single shared mock stream
- `sessions.find(s => s.id === sessionId)` — to check running status

**Rendering:**
- `ScrollArea` wrapping a vertical list of `StreamEvent` components
- Typing indicator at bottom when `session.status === 'running'`: blinking cursor + "Agent is thinking..."

**Production gap:** Uses same `streamEvents` array regardless of `sessionId`. Production should fetch from `GET /api/sessions/:sessionId/events` and receive live events via Socket.IO `session:event`.

---

### `StreamEvent` — `components/agents/stream-event.tsx`

**Props:**
```typescript
interface StreamEventProps {
  event: StreamEventType
}
```

**Event type rendering:**

| Type | Icon | Style | Behavior |
|------|------|-------|----------|
| `system` | Terminal | Gray bg, monospace text | Static display |
| `assistant` | MessageSquare | Normal text, left-padded | Static display |
| `tool_use` | Wrench (accent) | Bordered card, expandable | Click to toggle tool result |
| `tool_result` | — | Bordered card, monospace pre | Static (standalone, not nested) |
| `result` | CheckCircle (green) | Green border/bg | Session completion summary |
| `error` | AlertCircle (red) | Red border/bg | Error message display |

**`tool_use` expansion:**
- Collapsed: chevron + tool icon + tool name + truncated input
- Expanded: adds bordered section with `toolResult` in monospace `<pre>` block
- Uses local `expanded` state

**Claude Code `stream-json` compatibility:**
The `StreamEvent` type maps to Claude Code's `--output-format=stream-json` NDJSON output:

| Stream JSON `type` | Maps to `StreamEvent.type` | Data extraction |
|---------------------|---------------------------|-----------------|
| `system` (subtype: `init`) | `system` | `event.content` from system message |
| `assistant` | `assistant` | `event.content` from `message.content[0].text` |
| `tool_use` | `tool_use` | `toolName` from `tool.name`, `toolInput` from `tool.input` |
| `tool_result` | `tool_result` | `content` from `result` |
| `result` | `result` | `content` from summary (cost, duration, etc.) |
| `error` | `error` | `content` from `message` |

---

### `SessionStatsBar` — `components/agents/session-stats-bar.tsx`

**Props:**
```typescript
interface SessionStatsBarProps {
  session: AgentSession
}
```

**Renders:** Fixed bottom bar with: Turns count | Files count | Duration | Model badge

**Static bar** — does not update live. Production should re-render on `session:progress` events.

**Gap:** Does not show cost or tokens (the header already shows these for active sessions, but the stats bar omits them).

---

### `AskQuestionDialog` — `components/agents/ask-question-dialog.tsx`

**Props:**
```typescript
interface AskQuestionDialogProps {
  session: AgentSession
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Requires:** `session.question` to be defined (returns null otherwise)

**Layout:**
1. Header: "Agent Question" title, agent name in description
2. Question text (italic)
3. Context block (gray background, if provided)
4. Option list: radio-button style selectable options
5. "Other" option: reveals text input for custom answer
6. Footer: "Skip (let agent decide)" + "Send" button

**Send validation:** `canSend` requires either a selected option OR the "Other" option with non-empty text.

**Production API mapping:**
- Send answer: `POST /api/sessions/:sessionId/answer { answer: string }` or Socket.IO `session:answer` event
- Skip: Same endpoint but with agent's auto-answer or empty string

**Production gaps:**
- `handleSend` fires `toast.success` only — no API call
- `handleSkip` fires `toast.info` only
- No timeout display (API spec defines `timeout_seconds` for hybrid mode)
- No risk level display (`risk_level: 'low' | 'high'` from spec)
- No auto-answer preview (spec defines `auto_answer` field for auto/hybrid modes)

---

### `SessionCard` — `components/agents/session-card.tsx`

**Status:** Exists with full implementations but is NOT used by either page. The `AgentsPage` uses inline `SessionListItem` instead. Retained for potential future use or alternate layouts.

**Props:**
```typescript
interface SessionCardProps {
  session: AgentSession
}
```

**Renders differently per status:**
- `running`: Live ping dot, agent name, model, epic/bead context, live duration, turns, files, last action, "View Stream" + "Cancel" buttons
- `waiting_input`: Warning-bordered card, ping dot, question text preview, "Answer" + "View Stream" + "Cancel" buttons, opens `AskQuestionDialog`
- `queued`: Queue position badge, model, epic context, requester name, "Cancel" + "Promote" buttons
- `completed`: Check icon, agent name, model, duration, turns, files, PR link with status badge, "View Stream" button
- `failed`: X icon, error-bordered, agent name, duration, "View Stream" + "Retry" buttons

All action buttons fire demo toasts only.

---

### `AgentStreamPage` — `pages/agent-stream-page.tsx`

**Route:** `/agents/:sessionId`

**State:**
- `sessionId` from URL params
- Local: `questionOpen` (auto-opens when session status is `waiting_input`)

**Layout:**
1. Header: Back link (to `/agents`), agent name, status badge, cancel button (active only)
2. Epic/bead context links (navigable: epic → `/board?epic=X`)
3. `AgentStreamView` (full height)
4. `SessionStatsBar` (fixed bottom)
5. `AskQuestionDialog` (overlay, conditional)

**404 handling:** Shows "Session not found" message with "Back to Agents" button.

---

## Agent Store (`stores/agent-store.ts`)

```typescript
interface AgentState {
  selectedSessionId: string | null
  setSelectedSessionId: (id: string | null) => void
}
```

**Minimal store** — currently NOT used by `AgentsPage` (which manages `selectedSessionId` locally). Could be useful if selection needs to persist across navigations.

---

## Data Types

### `AgentSession` (from `data/sessions.ts`)

```typescript
interface AgentSession {
  id: string
  epicId: string
  epicTitle: string
  beadId?: string
  beadTitle?: string
  agentName: string
  model: 'sonnet' | 'opus' | 'haiku'
  status: SessionStatus
  prompt: string
  turns: number
  filesModified: number
  lastAction: string
  duration: number
  question?: {
    text: string
    options: string[]
    context: string
  }
  prUrl?: string
  prNumber?: number
  prStatus?: string
  startedAt: number
  finishedAt?: number
  queuePosition?: number
  requestedById: string
  // Live metrics
  tokensUsed?: number
  contextWindowPercent?: number
  costUsd?: number
  subagentOf?: string
}
```

**DB mapping (`sessions` table):**

| Mock field | DB column | Notes |
|-----------|-----------|-------|
| `id` | `id` | UUID |
| `epicId` | `epic_id` | FK to epics |
| `epicTitle` | — | Joined from epics/br (not in sessions table) |
| `beadId` | — | Not in sessions table; inferred from prompt or separate tracking |
| `beadTitle` | — | Joined from br |
| `agentName` | `agent_mail_name` | |
| `model` | `model` | |
| `status` | `status` | Values differ: DB has `detached`/`validation_failed`, mock lacks these |
| `prompt` | `prompt` | |
| `turns` | — | Computed from `session_events` count |
| `filesModified` | — | Computed from tool_use events (Edit/Write) |
| `lastAction` | — | Last `session_event` data |
| `duration` | — | `finished_at - started_at` or live calculation |
| `question` | — | From `session:question` Socket.IO event |
| `prUrl` | `pr_url` | |
| `prNumber` | — | Parsed from `pr_url` |
| `prStatus` | `pr_status` | |
| `startedAt` | `started_at` | |
| `finishedAt` | `finished_at` | |
| `queuePosition` | — | From `agent_queue.position` |
| `requestedById` | `user_id` | |
| `tokensUsed` | — | From `session:progress` events or result event |
| `contextWindowPercent` | — | From `session:progress` events |
| `costUsd` | — | From `result` event `cost_usd` |
| `subagentOf` | — | Not in DB schema (future feature) |

### `StreamEvent` (from `data/agent-stream.ts`)

```typescript
interface StreamEvent {
  id: number
  type: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'
  content: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  timestamp: number
}
```

**DB mapping (`session_events` table):**

| Mock field | DB column | Notes |
|-----------|-----------|-------|
| `id` | `id` (INTEGER PK) | Auto-increment |
| `type` | `event_type` | Same enum values |
| `content` | — | Extracted from `data` JSON |
| `toolName` | — | Extracted from `data.tool.name` |
| `toolInput` | — | Extracted from `data.tool.input` |
| `toolResult` | — | Extracted from `data.result` |
| `timestamp` | `created_at` | epoch seconds |
| — | `session_id` | FK, used for filtering |
| — | `data` (TEXT) | Raw JSON, source for all extracted fields |

---

## Live Metrics

### Context window gauge

Displayed in both the session header (right panel) and session list items (left panel):

```
[========----------] 56%
```

**Color thresholds:**
| Range | Color | Meaning |
|-------|-------|---------|
| 0-60% | `accent/60` (blue) | Normal |
| 60-80% | `amber-400` | Warning |
| 80-100% | `red-400` | Critical |

**Production source:** `session:progress` Socket.IO event → `progress.context_window_percent` (not in current spec but implied by UI).

### Live duration counter (`LiveDuration` component)

Updates every second via `setInterval`. Shows `M:SS` format. Used in both `AgentsPage` (top-level and `SessionListItem`) and could be used in `AgentStreamPage`.

### Cost display

Format: `$0.XX` — from `session.costUsd`. Updated via `session:progress` events or `result` event.

---

## API Mapping

| UI action | API endpoint | Method |
|-----------|-------------|--------|
| List sessions | `GET /api/projects/:projectId/sessions` | GET |
| Session detail | `GET /api/sessions/:sessionId` | GET |
| Stream events | `GET /api/sessions/:sessionId/events?after_id=N&limit=50` | GET |
| Start session | `POST /api/projects/:projectId/sessions` | POST |
| Cancel session | `POST /api/sessions/:sessionId/cancel` | POST |
| Answer question | `POST /api/sessions/:sessionId/answer` | POST |
| Resume session | `POST /api/sessions/:sessionId/resume` | POST |

---

## Socket.IO Integration

### Session room events

| Event | Trigger | UI behavior |
|-------|---------|-------------|
| `session:event` | Each NDJSON line from claude | Append `StreamEvent` to stream view, auto-scroll |
| `session:question` | Agent calls AskUserQuestion | Show waiting input banner, open `AskQuestionDialog`, update status to `waiting_input` |
| `session:question:answered` | Answer sent or auto-answered | Dismiss banner, close dialog, update status back to `running` |
| `session:progress` | Every 10s during run | Update turns, files, context gauge, cost in header and list item |

### Project room events

| Event | Trigger | UI behavior |
|-------|---------|-------------|
| `session:lifecycle` | Session started/completed/failed/cancelled | Update session in list, move between tabs, update counters |
| `queue:updated` | Queue position changed | Update queue positions in queued tab |

### Client→Server

| Event | Payload | When |
|-------|---------|------|
| `join:session` | `{ sessionId }` | When selecting a session (split panel) or navigating to stream page |
| `leave:session` | `{ sessionId }` | When deselecting or navigating away |
| `session:answer` | `{ sessionId, questionId, answer }` | When answering via dialog |
| `session:cancel` | `{ sessionId }` | When clicking cancel button |

**Current state:** No Socket.IO integration. All data is static mock.

---

## Accessibility Notes

- `SessionListItem` renders as `<button>` — keyboard accessible
- `AskQuestionDialog` uses radix `Dialog` — focus trap, Escape to close
- Radio-style option buttons in `AskQuestionDialog` use custom styling (not native `<input type="radio">`) — may need ARIA roles
- `StreamEvent` tool_use cards are expandable via `<button>` — keyboard accessible
- Live counters update via `setInterval` — no ARIA live region announcements
- Context window gauge is visual-only — needs `aria-label` or `aria-valuenow`
- No screen reader announcement for new stream events arriving

---

## Known Data Source Issues

### `context_window_percent` Not in `session:progress` Event

The demo UI displays a context window gauge (`contextWindowPercent`) in both the session header and session list items. However, the `session:progress` Socket.IO event (defined in `04-socket-io-events.md`) only includes:

```typescript
progress: {
  turns: number
  tools_used: number
  files_modified: number
  elapsed_ms: number
  last_tool: string
}
```

There is **no `context_window_percent` field** in this payload. The implementation agent must either:

1. **Backend addition:** Add `context_window_percent` to the `session:progress` event payload. This requires parsing Claude Code's NDJSON output for context window usage (available in `system` events with subtype `usage`).
2. **Client-side estimation:** Estimate context usage from `turns` and `tools_used` using a heuristic (e.g., ~4K tokens per turn average). This would be inaccurate.
3. **Separate endpoint:** Add a `GET /api/sessions/:sessionId/usage` endpoint that returns context window stats.

Option 1 is recommended for accuracy.

### `session:lifecycle` vs Separate Events Discrepancy

There is an inconsistency between the two spec documents regarding session lifecycle events:

- **`02-api-specification.md`** defines **separate events**: `session:started`, `session:completed`, `session:failed` -- each as distinct event names.
- **`04-socket-io-events.md`** defines a **unified event**: `session:lifecycle` with an `event` field that contains the lifecycle stage (`started`, `completed`, `failed`, `cancelled`).

The implementation agent should follow `04-socket-io-events.md` (the dedicated Socket.IO spec) as the authoritative source, since it provides the full payload structure. However, the backend implementation must be verified to confirm which pattern it actually emits.

---

## Gaps vs API/Events Spec

| Gap | Detail | Priority |
|-----|--------|----------|
| **No TanStack Query** | Sessions from static import, not API | P0 |
| **No Socket.IO** | No real-time stream, questions, or progress | P0 |
| **Shared stream events** | All sessions show same `streamEvents` array | P0 |
| **No session creation** | "New Session" button shows demo toast only | P1 |
| **No cancel implementation** | Cancel buttons show demo toast only | P1 |
| **No answer implementation** | Answer dialog shows demo toast only | P1 |
| **No resume** | `POST /sessions/:id/resume` not exposed in UI | P2 |
| **Missing status values** | Mock lacks `detached`, `validation_failed` from DB schema | P2 |
| **No queue promotion** | SessionCard has "Promote" button but fires toast only | P2 |
| **subagentOf unused** | Field exists in type but never rendered | P3 |
| **No auto-scroll** | Stream view doesn't scroll to bottom on new events | P1 |
| **No event pagination** | No `after_id` / infinite scroll for stream events | P2 |
| **No hybrid/auto mode** | Question dialog doesn't show timeout, risk level, or auto-answer | P2 |
| **agent-store unused** | `useAgentStore` exists but `AgentsPage` uses local state | P3 |
| **No error boundaries** | No fallback UI for failed session/event fetches | P1 |
| **SessionCard unused** | Full component exists but not rendered by either page | P3 |
| **No session:progress** | Stats bar is static, no periodic updates | P1 |
| **Live metrics not live** | `tokensUsed`, `contextWindowPercent`, `costUsd` are static mock values | P1 |

---

## Integration Checklist

- [ ] Replace `import { sessions } from '@/data/sessions'` with `useQuery(['sessions', projectId], ...)`
- [ ] Replace `import { streamEvents } from '@/data/agent-stream'` with per-session event fetch
- [ ] Add Socket.IO `join:session` / `leave:session` on session selection change
- [ ] Add Socket.IO `session:event` listener → append events to stream view
- [ ] Add Socket.IO `session:question` listener → show banner + open dialog
- [ ] Add Socket.IO `session:lifecycle` listener → update session status in list
- [ ] Add Socket.IO `session:progress` listener → update live metrics
- [ ] Wire "New Session" to `POST /api/projects/:projectId/sessions` mutation
- [ ] Wire cancel to `POST /api/sessions/:sessionId/cancel` mutation
- [ ] Wire answer dialog to `POST /api/sessions/:sessionId/answer` mutation
- [ ] Add auto-scroll to bottom on new stream events
- [ ] Add event pagination with `after_id` parameter
- [ ] Add question dialog timeout countdown for hybrid mode
- [ ] Add risk level display in question dialog
- [ ] Show `detached` and `validation_failed` statuses
- [ ] Add loading skeletons for session list and stream
- [ ] Add error boundary with retry
- [ ] Consider using `useAgentStore` for cross-component selection persistence
- [ ] Add ARIA live regions for stream event announcements
- [ ] Add `aria-valuenow` to context window gauge
