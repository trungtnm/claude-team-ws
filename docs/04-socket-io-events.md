# Socket.IO Events & Real-time Communication — claude-team-ws

## Architecture

```
Browser (socket.io-client)
    │
    │ WebSocket (wss:// qua Cloudflare Tunnel)
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

| Room | Pattern | Ai join | Purpose |
|------|---------|---------|---------|
| `project:<projectId>` | Tất cả users mở project | Board updates, epic changes, session lifecycle |
| `session:<sessionId>` | Users đang xem agent stream | Real-time agent output, AskUserQuestion |
| `user:<userId>` | Authenticated user | Personal notifications |

---

## Server → Client Events

### Project Room Events

#### `capture:created`
Khi ai đó tạo capture mới.
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
Repo mới được thêm vào project.
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
Repo bị xóa khỏi project.
```typescript
{
  repo_name: string
  removed_by: { id: string, name: string }
}
```

#### `repo:clone_progress`
Progress khi đang clone repo lớn.
```typescript
{
  repo_name: string
  progress: string    // "Receiving objects: 45% (1234/2743)"
  status: 'cloning' | 'ready' | 'error'
  error?: string
}
```

#### `epic:created`
Epic mới được tạo (từ triage hoặc manual).
```typescript
{
  epic: {
    id: string
    bead_epic_id: string
    ui_status: 'draft'
    bead: { title: string, priority: number, type: string }
    created_by: { id: string, name: string }
  }
}
```

#### `epic:updated`
Epic status change (bất kỳ field nào thay đổi).
```typescript
{
  epic: {
    id: string
    bead_epic_id: string
    ui_status: string      // new status
    prev_status: string    // previous status
    bead: { ... }          // latest from br show
  }
  trigger: 'user' | 'agent' | 'system'  // ai gây ra thay đổi
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
Beads git sync failed — cần TechLead resolve thủ công trên host.
```typescript
{
  error: string
  details: string
  action_required: 'TechLead needs to resolve manually on host'
  host_command: string    // lệnh gợi ý cho TechLead chạy trên host
  timestamp: number
}
```
**UI behavior:** Hiện persistent red banner trên toàn project (tương tự Agent Alert Bar). Banner chỉ dismiss khi nhận `beads:sync_resolved`.

#### `beads:sync_resolved`
TechLead đã resolve conflict, sync hoạt động lại.
```typescript
{
  timestamp: number
}
```

---

### Session Room Events

#### `session:event`
Mỗi dòng NDJSON từ claude `--output-format=stream-json`.

```typescript
{
  session_id: string
  event_id: number        // session_events.id (cho replay)
  event_type: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'
  data: object             // Raw JSON từ claude stream
  timestamp: number
}
```

**`event_type` details:**

| Type | Khi nào | Data chứa gì |
|------|---------|---------------|
| `system` | Agent init | `{ type: "system", subtype: "init", session_id: "..." }` |
| `assistant` | Agent viết text | `{ type: "assistant", message: { content: [{ type: "text", text: "..." }] } }` |
| `tool_use` | Agent gọi tool | `{ type: "tool_use", tool: { name: "Edit", input: {...} } }` |
| `tool_result` | Tool trả kết quả | `{ type: "tool_result", result: "..." }` |
| `result` | Agent done | `{ type: "result", cost_usd: 0.15, duration_ms: 45000, ... }` |
| `error` | Lỗi | `{ type: "error", message: "..." }` |

#### `session:question`
AskUserQuestion triggered — agent đang chờ human input.

```typescript
{
  session_id: string
  question: {
    id: string            // question ID cho reply
    text: string          // câu hỏi
    options: Array<{      // multiple choice (nếu có)
      label: string
      description: string
    }> | null
    context: string       // surrounding context
  }
  mode: 'pause' | 'auto' | 'hybrid'  // current mode
  risk_level: 'low' | 'high'         // assessed risk (for hybrid mode)
  auto_answer: string | null          // nếu mode=auto, đây là answer agent sẽ dùng
  timeout_seconds: number | null      // auto-accept sau N giây (for hybrid LOW risk)
}
```

#### `session:question:answered`
Question đã được trả lời (bởi human hoặc auto).

```typescript
{
  session_id: string
  question_id: string
  answer: string
  answered_by: 'human' | 'auto' | 'timeout'
  user: { name: string } | null  // null nếu auto/timeout
}
```

#### `session:progress`
Periodic progress summary (mỗi 10 giây khi agent đang chạy).

```typescript
{
  session_id: string
  progress: {
    turns: number          // số turns hoàn thành
    tools_used: number     // số tool calls
    files_modified: number // estimate từ Edit/Write tool calls
    elapsed_ms: number
    last_tool: string      // tên tool gần nhất
  }
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
    link: string | null    // deep link trong UI
    project_id: string
  }
}
```

---

## Client → Server Events

### `join:project`
Join project room để nhận board updates.
```typescript
// Client emit
socket.emit('join:project', { projectId: '...' })

// Server handler
// 1. Verify user has access to project
// 2. socket.join(`project:${projectId}`)
// 3. Emit current state snapshot (optional)
```

### `join:session`
Join session room để nhận agent stream.
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
Trả lời AskUserQuestion.
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
Quick-create capture từ UI (thay vì HTTP POST).
```typescript
socket.emit('capture:create', {
  projectId: '...',
  text: 'Cần thêm rate limiting'
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
    token: apiKey  // hoặc JWT từ session cookie
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

Khi client reconnect sau disconnect:
1. Auto-rejoin rooms (client maintains list of joined rooms)
2. `join:session` emits last 50 events → client append vào existing stream
3. `join:project` emits current board state → client reconcile
