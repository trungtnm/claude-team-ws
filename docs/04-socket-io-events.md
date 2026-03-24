# Socket.IO Events & Real-time Communication — claude-team-ws

## Architecture

```
Browser (socket.io-client)
    │
    │ WebSocket (wss:// via Cloudflare Tunnel)
    │
    ▼
Express + Socket.IO Server (:3000)
    │
    ├── Rooms: project:<id>, session:<id>, user:<id>
    │
    ├── AgentManager (claude processes)
    │   └── stdout → parse NDJSON → emit to session room
    │
    ├── BeadsService (br CLI watcher)
    │   └── fs.watchFile(.beads/beads.db) → emit to project room
    │
    └── WebhookService
        └── Forward events to Slack/Discord
```

---

## Room Structure

| Room | Pattern | Who joins | Purpose |
|------|---------|---------|---------|
| `project:<projectId>` | All users who open the project | Board updates, epic changes, session lifecycle |
| `session:<sessionId>` | Users viewing the agent stream | Real-time agent output, AskUserQuestion |
| `user:<userId>` | Authenticated user | Personal notifications |

---

## Server → Client Events

### Project Room Events

#### `capture:created`
When someone creates a new capture.
```typescript
{
  capture: {
    id: string
    text: string
    status: 'pending'
    user: { id: string, name: string, avatar_url: string | null }
    created_at: number
  }
}
```

#### `repo:added`
A new repo has been added to the project.
```typescript
{
  repo: {
    name: string         // "backend"
    path: string
    git_url: string | null
    default_branch: string
    link_mode: 'clone' | 'symlink'
    status: 'ready' | 'cloning'
    added_by: { id: string, name: string }
  }
}
```

#### `repo:removed`
A repo has been removed from the project.
```typescript
{
  repo_name: string
  removed_by: { id: string, name: string }
}
```

#### `repo:clone_progress`
Progress while cloning a large repo.
```typescript
{
  repo_name: string
  progress: string    // "Receiving objects: 45% (1234/2743)"
  status: 'cloning' | 'ready' | 'error'
  error?: string
}
```

#### `epic:created`
A new Epic has been created (from triage or manually).
```typescript
{
  epic: {
    id: string
    bead_epic_id: string
    ui_status: 'blocked'
    bead: { title: string, priority: number, type: string }
    created_by: { id: string, name: string }
  }
}
```

#### `epic:updated`
Epic status change (any field changed).
```typescript
{
  epic: {
    id: string
    bead_epic_id: string
    ui_status: string      // new status
    prev_status: string    // previous status
    bead: { ... }          // latest from br show
  }
  trigger: 'user' | 'agent' | 'system'  // who caused the change
}
```

#### `session:lifecycle`
Session lifecycle events (started, completed, failed, cancelled).
```typescript
{
  session: {
    id: string
    epic_id: string | null
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    user: { id: string, name: string }
    agent_mail_name: string | null
    model: string
  }
  event: 'started' | 'completed' | 'failed' | 'cancelled'
}
```

#### `pr:event`
PR lifecycle.
```typescript
{
  pr: {
    url: string
    title: string
    status: 'created' | 'review_complete' | 'changes_requested' | 'approved' | 'merged'
    epic_id: string
    session_id: string
  }
}
```

#### `queue:updated`
Agent queue changed.
```typescript
{
  queue: {
    length: number
    items: Array<{
      id: string
      epic_title: string
      priority: number
      position: number
      user: { name: string }
    }>
  }
}
```

#### `beads:changed`
Beads DB changed (detected via fs.watchFile). Client should refetch.
```typescript
{
  timestamp: number
  hint: 'refetch_board' | 'refetch_graph'
}
```

#### `beads:sync_conflict`
Beads git sync failed — TechLead needs to resolve manually on host.
```typescript
{
  error: string
  details: string
  action_required: 'TechLead needs to resolve manually on host'
  host_command: string    // suggested command for TechLead to run on host
  timestamp: number
}
```
**UI behavior:** Show a persistent red banner across the entire project (similar to Agent Alert Bar). The banner is only dismissed when `beads:sync_resolved` is received.

#### `beads:sync_resolved`
TechLead has resolved the conflict, sync is working again.
```typescript
{
  timestamp: number
}
```

#### `member:added`
New member added to project.
```typescript
{
  member: { user_id: string, name: string, email: string, role_override: string | null }
  added_by: string
}
```

#### `member:removed`
Member removed from project.
```typescript
{
  user_id: string
  removed_by: string
}
```

---

### Session Room Events

#### `session:event`
Each NDJSON line from claude `--output-format=stream-json`.

```typescript
{
  session_id: string
  event_id: number        // session_events.id (for replay)
  event_type: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'
  data: object             // Raw JSON from claude stream
  timestamp: number
}
```

**`event_type` details:**

| Type | When | Data contains |
|------|---------|---------------|
| `system` | Agent init | `{ type: "system", subtype: "init", session_id: "..." }` |
| `assistant` | Agent writes text | `{ type: "assistant", message: { content: [{ type: "text", text: "..." }] } }` |
| `tool_use` | Agent calls a tool | `{ type: "tool_use", tool: { name: "Edit", input: {...} } }` |
| `tool_result` | Tool returns result | `{ type: "tool_result", result: "..." }` |
| `result` | Agent done | `{ type: "result", cost_usd: 0.15, duration_ms: 45000, ... }` |
| `error` | Error | `{ type: "error", message: "..." }` |

#### `session:question`
AskUserQuestion triggered — agent is waiting for human input.

```typescript
{
  session_id: string
  question: {
    id: string            // question ID for reply
    text: string          // the question
    options: Array<{      // multiple choice (if any)
      label: string
      description: string
    }> | null
    context: string       // surrounding context
  }
  mode: 'pause' | 'auto' | 'hybrid'  // current mode
  risk_level: 'low' | 'high'         // assessed risk (for hybrid mode)
  auto_answer: string | null          // if mode=auto, this is the answer the agent will use
  timeout_seconds: number | null      // auto-accept after N seconds (for hybrid LOW risk)
}
```

#### `session:question:answered`
Question has been answered (by human or auto).

```typescript
{
  session_id: string
  question_id: string
  answer: string
  answered_by: 'human' | 'auto' | 'timeout'
  user: { name: string } | null  // null if auto/timeout
}
```

#### `session:progress`
Periodic progress summary (every 10 seconds while agent is running).

```typescript
{
  session_id: string
  progress: {
    turns: number          // number of completed turns
    tools_used: number     // number of tool calls
    files_modified: number // estimate from Edit/Write tool calls
    elapsed_ms: number
    last_tool: string      // most recent tool name
    context_window: {
      limit: number        // max tokens for the model
      used: number         // input_tokens + cache_creation + cache_read
      percent: number      // 0-100, derived from used/limit
    }
  }
}
```

#### `session:scope_gate`
Emitted when scope analysis suggests the epic should be split before starting the agent session.

```typescript
{
  session_id: string
  epic_id: string
  analysis: {
    estimated_tokens: number
    files_affected: number
    complexity: 'low' | 'medium' | 'high'
    recommendation: 'proceed' | 'split'
    proposed_beads: Array<{ title: string; priority: number; description: string }>
  }
}
```

#### `session:validation_failed`
Emitted when pre-push validation fails after agent completes work.

```typescript
{
  session_id: string
  epic_id: string
  validation: {
    passed: false
    checks: Array<{
      name: string           // 'tests' | 'build' | 'typecheck' | 'forbidden_patterns'
      status: 'pass' | 'fail' | 'skip'
      output: string | null
    }>
  }
  actions: ['fix_retry', 'force_push', 'cancel']  // available user actions
}
```

---

### User Room Events

#### `notification`
Personal notification.

```typescript
{
  notification: {
    id: string
    type: 'agent_complete' | 'pr_ready' | 'review_needed' | 'question_waiting' | 'merge_complete'
    title: string
    body: string | null
    link: string | null    // deep link in UI
    project_id: string
  }
}
```

---

## Client → Server Events

### `join:project`
Join project room to receive board updates.
```typescript
// Client emit
socket.emit('join:project', { projectId: '...' })

// Server handler
// 1. Verify user has access to project
// 2. socket.join(`project:${projectId}`)
// 3. Emit current state snapshot (optional)
```

### `join:session`
Join session room to receive agent stream.
```typescript
socket.emit('join:session', { sessionId: '...' })

// Server handler
// 1. Verify session exists and user has access
// 2. socket.join(`session:${sessionId}`)
// 3. Emit recent events (last 50) for catch-up
```

### `leave:session`
Leave session room.
```typescript
socket.emit('leave:session', { sessionId: '...' })
```

### `session:answer`
Answer an AskUserQuestion.
```typescript
socket.emit('session:answer', {
  sessionId: '...',
  questionId: '...',
  answer: 'Use JWT tokens'
})

// Server handler
// 1. Verify user has permission (PM, Dev, TechLead)
// 2. AgentManager.answerQuestion(sessionId, answer)
// 3. Emit session:question:answered to session room
```

### `session:cancel`
Cancel running session.
```typescript
socket.emit('session:cancel', { sessionId: '...' })

// Server handler
// 1. Verify user is owner, PM, or TechLead
// 2. AgentManager.cancel(sessionId)
// 3. Emit session:lifecycle to project room
```

### `capture:create`
Quick-create capture from UI (instead of HTTP POST).
```typescript
socket.emit('capture:create', {
  projectId: '...',
  text: 'Need to add rate limiting'
})

// Server handler
// 1. Verify permission
// 2. Insert into captures table
// 3. Emit capture:created to project room
```

---

## Connection Lifecycle

### Client Connect

```typescript
import { io } from 'socket.io-client'

const socket = io('/', {
  auth: {
    token: apiKey  // or JWT from session cookie
  },
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 30000
})

socket.on('connect', () => {
  // Auto-join project room
  socket.emit('join:project', { projectId: currentProjectId })
})

socket.on('disconnect', (reason) => {
  // Socket.IO auto-reconnect handles this
  console.log('Disconnected:', reason)
})

socket.on('connect_error', (error) => {
  if (error.message === 'unauthorized') {
    // Redirect to login
  }
})
```

### Server Auth Middleware

```typescript
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (!token) return next(new Error('unauthorized'))

  const user = await verifyApiKey(token) || await verifyJwt(token)
  if (!user) return next(new Error('unauthorized'))

  socket.data.user = user
  socket.join(`user:${user.id}`)
  next()
})
```

### Reconnection & Catch-up

When the client reconnects after a disconnect:
1. Auto-rejoin rooms (client maintains list of joined rooms)
2. `join:session` emits last 50 events → client appends to existing stream
3. `join:project` emits current board state → client reconciles
