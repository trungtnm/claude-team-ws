# Claude Code Mission Control — UI Spec

Self-contained playground at `playgrounds/agents/` for spawning, streaming, and interacting with Claude Code sessions via the Anthropic Agent SDK.

---

## Stack Profile

| Layer | Technology |
|-------|-----------|
| Framework | React 19, Vite 6 |
| Language | TypeScript 5 (strict) |
| Server state | TanStack Query 5 |
| Real-time | Socket.IO 4 (client + server) |
| UI primitives | shadcn/ui (Radix) — Badge, Button, Card, Dialog, Input, ScrollArea |
| Styling | Tailwind CSS 4, Warm Workshop theme tokens |
| Markdown | react-markdown 10 |
| Icons | lucide-react |
| Toast | sonner |
| Backend | Express 5 + Socket.IO 4 + Anthropic Agent SDK |
| Agent runtime | `@anthropic-ai/claude-agent-sdk` |
| State | In-memory (Map), no database |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ Browser (localhost:5175)                              │
│                                                       │
│  React SPA                                            │
│  ├── TanStack Query (polls /api/sessions)             │
│  ├── Socket.IO client (real-time event push)          │
│  └── Vite proxy → localhost:3001                      │
│                                                       │
├──────────────────────────────────────────────────────┤
│ Server (localhost:3001)                               │
│                                                       │
│  Express + Socket.IO                                  │
│  └── SessionManager                                   │
│      ├── In-memory Map<id, ManagedSession>             │
│      ├── @anthropic-ai/claude-agent-sdk query()        │
│      ├── canUseTool callback (auto-approve + Q&A hold) │
│      └── File attachments → /tmp/ctw-playground-*      │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | `Navigate → /agents` | Redirect |
| `/agents` | `AgentsPage` | Split-panel: session list + stream preview |
| `/agents/:sessionId` | `AgentStreamPage` | Full-view stream for one session |

---

## REST API

| Method | Path | Body | Response | Purpose |
|--------|------|------|----------|---------|
| GET | `/api/capabilities` | — | `{ capabilities }` | Last-known commands/agents/skills |
| GET | `/api/sessions` | — | `{ sessions: SessionSummary[] }` | List all sessions (no events) |
| GET | `/api/sessions/:id` | — | `{ session: SessionInfo }` | Full session with events |
| POST | `/api/sessions` | `CreateSessionRequest` | `{ session }` | Spawn new Claude Code session |
| POST | `/api/sessions/:id/message` | `SendMessageRequest` | `{ message }` | Send follow-up or interrupt |
| POST | `/api/sessions/:id/answer` | `AnswerRequest` | `{ message }` | Answer pending AskUserQuestion |
| POST | `/api/sessions/:id/complete` | — | `{ message }` | Manually mark as completed |
| POST | `/api/sessions/:id/cancel` | — | `{ message }` | Abort running session |
| POST | `/api/sessions/:id/permission-mode` | `{ mode }` | `{ message }` | Switch permission mode |
| DELETE | `/api/sessions/:id` | — | `{ message }` | Delete session + history |
| DELETE | `/api/sessions` | — | `{ cleared, historyDeleted }` | Cleanup all sessions |

---

## Socket.IO Events

### Server → Client

| Event | Payload | Trigger |
|-------|---------|---------|
| `session:created` | `SessionSummary` | New session spawned |
| `session:event` | `{ sessionId, event: StreamEvent }` | Each NDJSON event from Claude |
| `session:question` | `{ sessionId, question: SessionQuestion }` | AskUserQuestion detected |
| `session:lifecycle` | `{ sessionId, status }` | Status change (running/idle/completed/failed/cancelled) |

### Client → Server

| Event | Payload | Purpose |
|-------|---------|---------|
| `join:session` | `sessionId: string` | Join session room |
| `leave:session` | `sessionId: string` | Leave session room |

---

## Session Lifecycle

```
                    ┌──────────┐
                    │  create  │
                    └────┬─────┘
                         ▼
                    ┌──────────┐
              ┌────►│ running  │◄───────────────┐
              │     └──┬───┬───┘                │
              │        │   │                    │
              │        │   ▼                    │
              │        │ ┌──────────────┐       │
              │        │ │ waiting_input │       │
              │        │ └──────┬───────┘       │
              │        │        │ answer()      │
              │        │        └───────────────┘
              │        ▼
              │   ┌──────────┐
              │   │   idle   │ ← agent finished turn
              │   └──┬──┬──┬─┘
              │      │  │  │
  sendMessage()──────┘  │  └──► complete() ──► ┌───────────┐
                        │                      │ completed  │
                        ▼                      └───────────┘
                   ┌───────────┐
                   │ cancelled │ ← cancel() from any active state
                   └───────────┘
```

Key behaviors:
- Agent finishing a turn → `idle` (NOT completed)
- User sends message to idle → `running` (resumes via `--resume` flag)
- User sends message to running → abort + resume (interrupt)
- User clicks Complete → `completed` (manual only)
- Multi-turn: cost/tokens accumulate across `--resume` calls

---

## Pages

### AgentsPage (`/agents`)

Split-panel layout:

```
┌──────────────────────────────────────────────────────────┐
│ Top bar: "Agents" title, live counters, [+ New Session]  │
├────────────────────┬─────────────────────────────────────┤
│ Left (w-80)        │ Right (flex-1)                      │
│                    │                                     │
│ [Active|History]   │ Session header:                     │
│ [Search...]        │   name, id, model, status, duration │
│                    │   permission mode bar                │
│ SessionListItem    │                                     │
│ SessionListItem    │ AgentStreamView (scrollable):       │
│ SessionListItem    │   StreamEvent[]                     │
│ ...                │   InlineQuestionCard (if Q&A)       │
│                    │   Typing indicator                  │
│                    │   [↓ New messages] pill              │
│                    │                                     │
│                    │ SessionStatsBar:                     │
│                    │   context bar, turns, files, cost    │
│                    │                                     │
│                    │ SessionInput (always visible):       │
│                    │   RichInput with attachments         │
├────────────────────┴─────────────────────────────────────┤
│ NewSessionDialog (overlay)                                │
└──────────────────────────────────────────────────────────┘
```

### AgentStreamPage (`/agents/:sessionId`)

Full-screen version of the right panel:

```
┌──────────────────────────────────────────────────────────┐
│ [← Back] Session name, status, model, permission bar     │
│ target directory path                                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ AgentStreamView (full height, scrollable)                │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ SessionStatsBar                                          │
├──────────────────────────────────────────────────────────┤
│ SessionInput                                             │
└──────────────────────────────────────────────────────────┘
```

---

## Components

### `AgentStreamView`

Scrollable container for all session events.

| Feature | Implementation |
|---------|---------------|
| Sticky scroll | Auto-scrolls to bottom when at bottom; stops when user scrolls up |
| New messages pill | Floating button: "New messages" (accent) or "Scroll to bottom" (neutral) |
| Auto-scroll on Q&A | Force-scrolls when `waiting_input` status detected |
| Session switch | Resets scroll to bottom on `sessionId` change |
| Container | Native `overflow-y-auto` with `h-full` (not Radix ScrollArea) |

Data flow: `useSessionQuery(sessionId)` → `session.events` + Socket.IO `session:event` optimistic append.

### `StreamEvent`

Renders a single event. Type-based rendering:

| `event.type` | Visual | Key detail |
|-------------|--------|-----------|
| `system` | Gray monospace box with Terminal icon | Init, approved tool messages |
| `assistant` | Markdown prose with MessageSquare icon | Full `react-markdown` rendering |
| `user_message` | Accent-bordered card with User icon | Shows attachment thumbnails inline |
| `tool_use` | Collapsible bordered card with Wrench icon | Click to expand tool result |
| `tool_use` (AskUserQuestion) | `InlineQuestionCard` | Special rendering with answer form |
| `tool_result` | Hidden (`return null`) | Content attached to preceding tool_use |
| `result` | Cost/duration pill with DollarSign icon | Only shows metadata, not result text |
| `error` | Red-bordered card with AlertCircle icon | Error messages |

### `InlineQuestionCard`

Inline Q&A widget rendered inside the stream for `AskUserQuestion` events.

**Waiting state** (amber border):
- Question text + context
- Radio-button options from `questionData.options`
- "Other" option with text input
- "Send Answer" + "Skip" buttons

**Answered state** (collapsible, accent border):
- One-liner: question text + answer badge
- Click to expand: all options shown, selected one highlighted
- Context shown at bottom

Data: uses `event.questionData` (persisted on the StreamEvent, survives `session.question` clearing).

### `SessionStatsBar`

Status line inspired by Claude Code's terminal status line.

| Section | Data source |
|---------|------------|
| Context window bar | `session.contextWindow.usedPercentage` — color-coded (green/amber/red) |
| Turns / Files | `session.turns`, `session.filesModified` |
| Duration | Live ticker (1s interval) when running, static when finished |
| Model | `session.model` as Badge |
| Tokens | `session.tokensUsed` formatted as `45.2k` |
| Cost | `session.costUsd` in accent color |
| Context detail | Right-aligned: current input tokens + cache read count |

### `SessionInput`

Always-visible input bar. Wraps `RichInput` with session-specific behavior.

| Status | Placeholder | Extra |
|--------|------------|-------|
| `running` | "Interrupt agent..." | Stop button (red circle) |
| `idle` | "Message..." | — |
| `waiting_input` | "Message..." | — |
| terminal | Hidden (`return null`) | — |

### `RichInput`

Reusable rich text input. Used in both `SessionInput` and `NewSessionDialog`.

| Feature | Implementation |
|---------|---------------|
| Autocomplete | `/` triggers commands+skills, `@` triggers agents |
| Autocomplete data | `capabilities` prop from `SessionCapabilities` or `GET /api/capabilities` |
| Autocomplete items | Label (colored), type badge, description (truncated) |
| Autocomplete nav | Arrow keys with `scrollIntoView`, Tab/Enter select, Escape dismiss |
| File attach | Paperclip button → file picker (images, code, PDFs, etc.) |
| Image attach | Image button → image picker |
| Clipboard paste | Intercepts `paste` event for image/file data |
| Drag and drop | Drop zone highlight, files saved via backend |
| Attachment previews | Image thumbnails (6x6) or file badge inside input container |
| Auto-resize | Textarea grows up to `maxHeight` (default 120px) |
| Submit | Enter to send, Shift+Enter for newline |

### `NewSessionDialog`

Radix Dialog with session configuration:

| Field | Control | Default |
|-------|---------|---------|
| Prompt | `RichInput` (with autocomplete + attachments) | — |
| Model | 3 toggle buttons: Sonnet / Opus / Haiku | sonnet |
| Target Directory | Text input (monospace) | `/Users/trungtran/code/claude-team-ws` |
| Permission Mode | 4 toggle buttons: Default / Plan / Auto / Bypass | default |

On submit: `POST /api/sessions` → auto-select new session in list. If attachments present, sends follow-up `POST /api/sessions/:id/message` after 2s delay.

### `PermissionModeBar`

Inline button group in session header. 4 buttons with icons:

| Mode | Icon | Description |
|------|------|------------|
| Default | Shield | Prompts for each tool |
| Plan | Eye | Read-only, no edits |
| Accept Edits | ShieldCheck | Auto-accept file edits |
| Bypass | ShieldOff | Skip all checks |

Calls `POST /api/sessions/:id/permission-mode`. Takes effect on next `--resume`.

---

## Data Flow

### Session List (left panel)

```
useSessionsQuery() ─── polls GET /api/sessions every 5s
       │
       ├── Socket.IO session:created → invalidate
       ├── Socket.IO session:lifecycle → invalidate
       │
       └── renders SessionListItem[]
```

### Session Detail (right panel)

```
useSessionQuery(id) ─── polls GET /api/sessions/:id every 3s
       │
       ├── Socket.IO session:event → optimistic append to events[]
       ├── Socket.IO session:lifecycle → invalidate
       ├── Socket.IO session:question → invalidate
       │
       └── renders AgentStreamView + SessionStatsBar + SessionInput
```

### Capabilities (autocomplete)

```
useCapabilitiesQuery() ─── polls GET /api/capabilities every 30s
       │
       └── last-seen capabilities from any session's system.init event
           enriched via agentQuery.supportedCommands() / supportedAgents()
```

---

## AskUserQuestion Flow

```
1. Agent calls AskUserQuestion tool
2. canUseTool callback fires in SessionManager
3. Extract question from tool input → store on SessionInfo.question + StreamEvent.questionData
4. Set status = 'waiting_input', emit session:question
5. Hold Promise — canUseTool does NOT resolve
6. Frontend renders InlineQuestionCard with options
7. User clicks answer → POST /api/sessions/:id/answer
8. Backend resolves pending Promise with { behavior: 'allow', updatedInput: { answers: {q: answer} } }
9. Tool executes with pre-filled answer, returns normally
10. Agent sees answer and continues
```

---

## File Attachments Flow

```
1. User attaches file/image in RichInput (paste, drag, button)
2. File → FileReader → base64 Attachment object
3. POST /api/sessions/:id/message { message, attachments }
4. Backend saves each attachment to /tmp/ctw-playground-attachments/<id>-<random>-<name>
5. Prompt includes: "Attached image: name.png\nSaved at: /tmp/.../name.png\nUse the Read tool to view"
6. Agent uses Read tool → reads actual file from disk
7. Stream event shows user message with inline image thumbnails
```

---

## Design Tokens

Warm Workshop theme — see `src/index.css`:

| Token | Value | Usage |
|-------|-------|-------|
| `surface-base` | `#141210` | Page background |
| `surface-raised` | `#1c1a17` | Cards, stats bar |
| `surface-elevated` | `#221f1b` | Hover, selected items |
| `accent` | `#f59e0b` | CTA, selected states, accent text |
| `ink` | `#f5f0eb` | Primary text |
| `ink-secondary` | `#a8a29e` | Secondary text |
| `ink-muted` | `#78716c` | Muted labels |
| `ink-disabled` | `#57534e` | Disabled text |
| `edge` | `rgba(168,162,158,0.12)` | Borders |
| `success` | `#22c55e` | Completed, result events |
| `error` | `#ef4444` | Error events, cancel |
| `info` | `#3b82f6` | Idle status |

---

## Testing

8 Playwright E2E tests in `e2e/agents.spec.ts`:

| Test | What it verifies |
|------|-----------------|
| loads the agents page | Title + New Session button |
| opens new session dialog | All form controls present |
| creates a session | Session appears in list with Running status |
| session streams events and goes idle | Events appear, cost shows, status = Idle |
| input bar has attach buttons | Paperclip + image buttons visible |
| input bar shows autocomplete on / trigger | Slash command items appear |
| can send follow-up message | Message in stream, re-runs, goes idle again |
| can complete a session manually | Status changes to Completed |

`afterEach` calls `DELETE /api/sessions` to clean up Claude history files.

---

## File Index

| File | Purpose |
|------|---------|
| `server/types.ts` | Shared types (SessionInfo, StreamEvent, etc.) |
| `server/session-manager.ts` | Core engine: spawn, stream, Q&A, cleanup |
| `server/index.ts` | Express + Socket.IO server, 11 REST endpoints |
| `src/app.tsx` | QueryClientProvider + SocketBridge + routes |
| `src/lib/api.ts` | Fetch wrapper for all endpoints |
| `src/lib/socket.ts` | Socket.IO client singleton |
| `src/hooks/use-sessions.ts` | TanStack Query hooks + Socket.IO cache invalidation |
| `src/pages/agents-page.tsx` | Split-panel session list + stream |
| `src/pages/agent-stream-page.tsx` | Full-view stream page |
| `src/components/agents/agent-stream-view.tsx` | Scrollable event stream with sticky scroll |
| `src/components/agents/stream-event.tsx` | Per-event rendering (markdown, tool_use, Q&A) |
| `src/components/agents/session-stats-bar.tsx` | Status line: context bar, tokens, cost |
| `src/components/agents/session-input.tsx` | Always-visible input with stop button |
| `src/components/agents/rich-input.tsx` | Shared: autocomplete, attachments, paste, DnD |
| `src/components/agents/new-session-dialog.tsx` | Session creation form |
| `src/components/agents/permission-mode-bar.tsx` | Permission mode quick-switch buttons |
| `src/components/agents/ask-question-dialog.tsx` | Legacy dialog (unused, superseded by inline) |
| `src/data/sessions.ts` | Type re-exports from server |
| `src/data/agent-stream.ts` | Type re-exports from server |
| `src/data/users.ts` | Static user data (unused in current impl) |
| `e2e/agents.spec.ts` | 8 Playwright tests with cleanup |
| `playwright.config.ts` | Playwright config with webServer |
