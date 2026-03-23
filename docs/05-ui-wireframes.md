# UI Wireframes & Component Specs — claude-team-ws

## Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│  Header: Logo │ Project Selector │ Search │ 🔔 │ Avatar ▼   │
├──────────────────────────────────────────────────────────────┤
│ ⚠ AGENT NEEDS INPUT ─ "Which search provider?" ─ [Answer] │ ← Alert Bar (khi có agent waiting)
├──────┬───────────────────────────────────────────────────────┤
│      │                                                       │
│  S   │              Main Content Area                        │
│  i   │                                                       │
│  d   │   (changes based on active page)                      │
│  e   │                                                       │
│  b   │                                                       │
│  a   │                                                       │
│  r   │                                                       │
│      │                                                       │
│  📋  │                                                       │
│  🤖  │                                                       │
│  📊  │                                                       │
│  📜  │                                                       │
│  ⚙   │                                                       │
│      │                                                       │
├──────┤                                                       │
│ Cap- │                                                       │
│ ture │                                                       │
│ In-  │                                                       │
│ box  │                                                       │
└──────┴───────────────────────────────────────────────────────┘
```

### Global Agent Alert Bar

Khi bất kỳ agent nào trong project đang `waiting_input` (AskUserQuestion), một alert bar đỏ/amber xuất hiện **dưới header, trên toàn bộ content area**. Alert bar:

- **Luôn visible** bất kể user đang ở page nào (Board, Agents, Graph...)
- **Pulsing animation** (CSS `animate-pulse`) để nổi bật — agent đang bị block, chờ human
- **Hiển thị**: Agent name + câu hỏi (truncated) + [Answer] button
- **Click [Answer]** → mở AskUserQuestion modal (hoặc navigate tới agent stream)
- **Nếu nhiều agents chờ** → hiện count: "2 agents need input" + dropdown list
- **Auto-dismiss** khi question được trả lời (human hoặc auto-timeout)
- **Kèm browser notification** (nếu user đã grant permission) + sound ping

```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 AGENT WAITING ─ BlueLake asks: "Which search prov…"      │
│                                          [Answer] [Dismiss]  │
└──────────────────────────────────────────────────────────────┘
  ↑ Red/amber background, pulsing border, z-index trên cùng
```

Nếu 2+ agents chờ:
```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 2 AGENTS NEED INPUT                            [View All] │
│   BlueLake: "Which search provider?"               [Answer]  │
│   RedStone: "Use JWT or session cookies?"          [Answer]  │
└──────────────────────────────────────────────────────────────┘
```

**Sidebar Navigation:**
- 📋 Board (Epic Kanban)
- 🤖 Agents (Sessions list + stream)
- 📊 Graph (Dependency visualization)
- 📜 Activity (Team feed)
- ⚙ Settings (Project config, Users, Rules, Webhooks)

**Capture Inbox**: Luôn hiện ở dưới sidebar. Collapsible. Badge count cho pending captures.

---

## Page 1: Epic Kanban Board (`/projects/:id/board`)

```
┌──────────────────────────────────────────────────────────────┐
│ Board ▼   │ Filter: [All Types ▼] [All Labels ▼] [Search…]  │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│  Draft   │  Ready   │ In Prog  │In Review │     Done        │
│  (3)     │  (5)     │  (2)     │  (1)     │     (12)        │
├──────────┼──────────┼──────────┼──────────┼─────────────────┤
│┌────────┐│┌────────┐│┌────────┐│┌────────┐│┌───────────────┐│
││ P1 🔵  │││ P0 🔴  │││ P1 🔵  │││ P1 🔵  │││ P2 ✅         ││
││ Auth   │││ Rate   │││ Search │││ Auth   │││ Login page     ││
││ Refact │││ Limit  │││ API    │││ Tests  │││ @Trung         ││
││        │││        │││        │││        │││ merged 2h ago  ││
││ 3 beads│││ ▶ Start│││ 🤖 run │││ PR #45 │││               ││
││ @Minh  │││ 5 beads│││ @Bot   │││ review │││               ││
│└────────┘│└────────┘│└────────┘│└────────┘│└───────────────┘│
│┌────────┐│┌────────┐│┌────────┐│          │                 │
││ P2 🟡  │││ P1 🔵  │││ P2 🟡  ││          │                 │
││ Docs   │││ Notif  │││ Cache  ││          │                 │
││ update │││ system │││ layer  ││          │                 │
││        │││        │││ 🤖 wait││          │                 │
││ 0 beads│││ ▶ Start│││ ❓ Q&A ││          │                 │
│└────────┘│└────────┘│└────────┘│          │                 │
│          │          │          │          │                 │
│ [+ Epic] │          │          │          │                 │
└──────────┴──────────┴──────────┴──────────┴─────────────────┘
```

### Epic Card Component

```
┌─────────────────────┐
│ P1 🔵  feature      │  ← Priority badge + type icon
│ Rate Limiting       │  ← Title
│                     │
│ 5 beads (2/5 done)  │  ← Progress: nested beads count
│ ████████░░░░  40%   │  ← Progress bar
│                     │
│ 🤖 running  @Bot    │  ← Agent status indicator (nếu active)
│ ▶ Start             │  ← Action button (nếu ready)
│ PR #45  🔍 review   │  ← PR status (nếu in_review)
│                     │
│ @Minh  •  2h ago    │  ← Assignee + last updated
│ backend, security   │  ← Labels
└─────────────────────┘
```

**Card states:**
- Default: Drag-and-droppable giữa columns
- `🤖 running`: Agent đang chạy. Click → mở Agent Stream panel
- `❓ Q&A`: Agent đang chờ human input. Click → mở Q&A dialog
- `▶ Start`: Ready to start. Click → Spawn dialog
- `PR #45`: PR đã tạo. Click → mở Review Module

### Click Epic → Side Panel

```
┌───────────────────────────────────────┐
│ ← Back   Rate Limiting    P0 🔴      │
├───────────────────────────────────────┤
│ Description:                          │
│ Add rate limiting to all public API   │
│ endpoints. Use Redis as backend.      │
│                                       │
│ Acceptance Criteria:                  │
│ ☐ Rate limiter middleware created     │
│ ☐ Redis integration                  │
│ ☐ Per-endpoint config                │
│ ☑ Integration tests                  │
├───────────────────────────────────────┤
│ Nested Beads:                         │
│ ┌─ ☐ bd-43 Setup middleware    P1   │
│ ├─ ☐ bd-44 Redis backend      P1   │
│ ├─ ☑ bd-45 Integration tests  P2   │
│ └─ ☐ bd-46 Config system      P2   │
├───────────────────────────────────────┤
│ Sessions:                             │
│ 🤖 Session #3 — running (5m)         │
│    BlueLake • sonnet • 12 turns       │
│ 🟢 Session #2 — completed (15m)      │
│    RedStone • opus • 45 turns         │
│ 🔴 Session #1 — failed (2m)          │
│    GreenCastle • sonnet • error       │
├───────────────────────────────────────┤
│ Git:                                  │
│ Branch: epic/rate-limiting            │
│ Repo: backend                         │
│ PR: #45 (changes_requested)           │
├───────────────────────────────────────┤
│ [▶ Start Session]  [📝 Edit]         │
└───────────────────────────────────────┘
```

---

## Page 2: Agent Sessions (`/projects/:id/agents`)

```
┌──────────────────────────────────────────────────────────────┐
│ Agents   │  Running: 2/3  │  Queued: 1  │  [+ New Session]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  🟢 RUNNING                                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ BlueLake • sonnet • Epic: Rate Limiting                │  │
│  │ Running 5m23s • 12 turns • 3 files modified            │  │
│  │ Last: Edit src/middleware/rate-limit.ts                 │  │
│  │                                    [View] [Cancel]     │  │
│  └────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ RedStone • opus • Epic: Search API                     │  │
│  │ ❓ Waiting for input (2m) — "Which search provider?"   │  │
│  │                              [Answer] [View] [Cancel]  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ⏳ QUEUED                                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ #1 in queue • Epic: Notification System • P1           │  │
│  │ Requested by @Minh • 3m ago         [Cancel] [Promote] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ✅ RECENT COMPLETED                                         │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ GreenCastle • sonnet • Epic: Login Page                │  │
│  │ Completed 2h ago • 45 turns • PR #42 merged            │  │
│  │                                             [Replay]   │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Agent Stream View (click "View")

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back   BlueLake • Rate Limiting       🟢 Running  [Cancel]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─ System ──────────────────────────────────────────────┐   │
│  │ Session started. Model: sonnet. Project: backend      │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  I'll start by reading the existing middleware setup...      │
│                                                              │
│  ┌─ Tool: Read ──────────────────────────────────────────┐   │
│  │ src/middleware/index.ts (42 lines)               [▼]  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  Now I'll create the rate limiter middleware. Let me         │
│  check if express-rate-limit is already installed...        │
│                                                              │
│  ┌─ Tool: Bash ──────────────────────────────────────────┐   │
│  │ $ cat package.json | grep rate                   [▼]  │   │
│  │ (no results)                                          │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  I need to install express-rate-limit and rate-limit-redis. │
│                                                              │
│  ┌─ Tool: Bash ──────────────────────────────────────────┐   │
│  │ $ pnpm add express-rate-limit rate-limit-redis   [▼]  │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                              │
│  ▊ (typing indicator)                                        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Turns: 12 │ Files: 3 │ Duration: 5m23s │ Model: sonnet      │
└──────────────────────────────────────────────────────────────┘
```

### AskUserQuestion Dialog

Khi agent cần human input (mode=pause):

```
┌──────────────────────────────────────────────────────────┐
│  ❓ Agent Question                              [Auto]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  BlueLake asks:                                          │
│                                                          │
│  "Which search provider should I use for the             │
│   full-text search API?"                                 │
│                                                          │
│  ○ Elasticsearch (recommended for scale)                 │
│  ○ PostgreSQL tsvector (simpler, no extra infra)         │
│  ○ MeiliSearch (lightweight, easy to deploy)             │
│  ○ Other: [________________]                             │
│                                                          │
│  Context: The project currently uses PostgreSQL.         │
│  There are ~50k documents to index.                      │
│                                                          │
│                        [Skip (let agent decide)] [Send]  │
└──────────────────────────────────────────────────────────┘
```

---

## Page 3: PR Review Module (`/projects/:id/review/:sessionId`)

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back   PR #45: Add rate limiting      [Approve] [Merge ▼] │
├──────────────────────────────┬───────────────────────────────┤
│                              │                               │
│  Files Changed (4)           │  AI Review Summary            │
│                              │                               │
│  📄 src/middleware/          │  ✅ UBS: Pass (0 issues)      │
│     rate-limit.ts (+45)      │  ⚠️ Security: 1 warning      │
│  📄 src/lib/redis.ts (+23)   │  ✅ Standards: Pass           │
│  📄 docker-compose.yml (+8)  │                               │
│  📄 tests/rate-limit.        │  Issues:                      │
│     test.ts (+67)            │  1. [HIGH] Missing Redis      │
│                              │     connection error handling  │
│                              │     → rate-limit.ts:23        │
│──────────────────────────────│                               │
│                              │  Verdict: Changes Requested   │
│  src/middleware/rate-limit.ts│                               │
│  ─────────────────────────── │───────────────────────────────│
│                              │                               │
│  + import rateLimit from     │  Human Comments:              │
│  +   'express-rate-limit'    │                               │
│  + import RedisStore from    │  📝 @Trung (2m ago):          │
│  +   'rate-limit-redis'     │  "Good catch on the Redis     │
│  +                           │   error. Also add fallback    │
│  + export const limiter =    │   to in-memory if Redis is    │
│  +   rateLimit({            │   down."                       │
│  +     store: new RedisStore │                               │
│  +     windowMs: 60_000,     │  [Add comment...]             │
│  +     max: 100,             │                               │
│  +   })                      │  ─────────────────────────    │
│  +                           │  [🤖 Send to Agent]           │
│  ⚠️ Line 23: Missing try/   │  Agent will fix and push      │
│     catch for Redis connect  │                               │
│                              │                               │
└──────────────────────────────┴───────────────────────────────┘
```

---

## Page 4: Dependency Graph (`/projects/:id/graph`)

```
┌──────────────────────────────────────────────────────────────┐
│ Graph   │ View: [DAG ▼] │ Show: [All ▼] │ [Critical Path]   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│           ┌──────────┐                                       │
│           │ bd-40    │ ◀── RED: Critical Path                │
│           │ Database │                                       │
│           │ Schema   │                                       │
│           │ 🟢 ready │                                       │
│           └────┬─────┘                                       │
│                │                                             │
│         ┌──────┼──────┐                                      │
│         │             │                                      │
│    ┌────▼───┐   ┌────▼───┐                                   │
│    │ bd-41  │   │ bd-42  │ ◀── ORANGE: Bottleneck            │
│    │ Auth   │   │ Rate   │                                   │
│    │ API    │   │ Limit  │                                   │
│    │ 🔵 prog│   │ 🔵 prog│                                   │
│    └────┬───┘   └────┬───┘                                   │
│         │            │                                       │
│    ┌────▼───┐   ┌────▼───┐                                   │
│    │ bd-43  │   │ bd-44  │                                   │
│    │ Auth   │   │ Rate   │                                   │
│    │ Tests  │   │ Tests  │                                   │
│    │ ⚪ open│   │ ⚪ open│                                   │
│    └────┬───┘   └────┬───┘                                   │
│         │            │                                       │
│         └──────┬─────┘                                       │
│           ┌────▼───┐                                         │
│           │ bd-45  │                                         │
│           │ E2E    │                                         │
│           │ Tests  │                                         │
│           │ ⚪ open│                                         │
│           └────────┘                                         │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Legend: 🟢 Ready  🔵 In Progress  🔴 Blocked  ⚪ Open       │
│ Metrics: Critical Path: 4 │ Ready: 1 │ Bottlenecks: 1       │
└──────────────────────────────────────────────────────────────┘
```

---

## Settings: Repos Management (`/projects/:id/settings/repos`)

Nằm trong Settings page. PM/TechLead quản lý repos.

```
┌──────────────────────────────────────────────────────────────┐
│ Settings > Repos                                    [+ Add]  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📦 backend                                      [···] │  │
│  │ git@github.com:team/backend.git                       │  │
│  │ Branch: main • Status: clean • Cloned                 │  │
│  │ Last commit: abc123 "Add rate limiting" (2h ago)      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📦 frontend                                     [···] │  │
│  │ git@github.com:team/frontend.git                      │  │
│  │ Branch: main • Status: clean • Cloned                 │  │
│  │ Last commit: def456 "Fix login form" (5h ago)         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 📦 mobile                                       [···] │  │
│  │ /Users/dev/mobile-app (symlinked)                     │  │
│  │ Branch: main • Status: 2 uncommitted • Linked         │  │
│  │ Last commit: ghi789 "Bump SDK" (1d ago)               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### [+ Add] Dialog

```
┌──────────────────────────────────────────────────┐
│  Add Repository                                  │
├──────────────────────────────────────────────────┤
│                                                  │
│  Mode:  (•) Clone from URL  ( ) Link existing    │
│                                                  │
│  ── Clone from URL ─────────────────────────     │
│  Name:     [backend        ]                     │
│  Git URL:  [git@github.com:team/backend.git  ]   │
│  Branch:   [main           ] (auto-detected)     │
│                                                  │
│  ── OR: Link existing ──────────────────────     │
│  Name:     [mobile         ]                     │
│  Path:     [/Users/dev/mobile-app        ] [📂]  │
│  Branch:   [main           ]                     │
│                                                  │
│                          [Cancel]  [Add Repo]    │
└──────────────────────────────────────────────────┘
```

### [···] Menu per repo

```
┌─────────────────────┐
│ Pull latest          │
│ View branches        │
│ Open in terminal     │
│ ──────────────────── │
│ Remove from project  │ ← requires confirmation, checks no active sessions
└─────────────────────┘
```

---

## Page 5: Capture Inbox (Sidebar Component)

```
┌────────────────────┐
│ 📥 Captures (4)    │
│ [+ Capture...]     │
├────────────────────┤
│                    │
│ ┌────────────────┐ │
│ │ Cần rate limit │ │
│ │ @Trung • 5m    │ │
│ │ [→ Epic] [✗]   │ │
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │
│ │ Bug: login     │ │
│ │ fails on Safari│ │
│ │ @Minh • 1h     │ │
│ │ [→ Epic] [✗]   │ │
│ └────────────────┘ │
│                    │
│ ┌────────────────┐ │
│ │ Refactor DB    │ │
│ │ connection pool│ │
│ │ @Bot • 3h      │ │
│ │ [deferred]     │ │
│ └────────────────┘ │
│                    │
│ ─── Deferred (2) ─│
│                    │
└────────────────────┘
```

---

## Component Library (shadcn/ui)

### Required Components

| Component | shadcn/ui | Custom |
|-----------|-----------|--------|
| Button, Input, Textarea | ✅ | |
| Card | ✅ | |
| Dialog, Sheet (side panel) | ✅ | |
| DropdownMenu, Select | ✅ | |
| Badge | ✅ | Priority badges (P0-P4) |
| Avatar | ✅ | |
| Tabs | ✅ | |
| Toast | ✅ | Notifications |
| Tooltip | ✅ | |
| Skeleton | ✅ | Loading states |
| ScrollArea | ✅ | Agent stream |
| Separator | ✅ | |
| | | EpicCard (Kanban card) |
| | | AgentStreamView (terminal) |
| | | CaptureInbox (sidebar) |
| | | DiffViewer (PR review) |
| | | GraphView (React Flow wrapper) |
| | | ProgressBar (Epic progress) |
| | | QueueIndicator |

### Additional Libraries

| Library | Purpose |
|---------|---------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | Kanban drag-and-drop |
| `@xyflow/react` | Dependency graph |
| `@dagrejs/dagre` | Auto-layout cho DAG |
| `react-diff-viewer-continued` | PR diff rendering |
| `react-router-dom` | Client-side routing |
| `@tanstack/react-query` | Server state + cache |
| `zustand` | Client state |
| `socket.io-client` | Real-time communication |
| `date-fns` | Date formatting |
| `lucide-react` | Icons |
