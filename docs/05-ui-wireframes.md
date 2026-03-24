# UI Wireframes & Component Specs — claude-team-ws

## Layout Structure

```
┌──────────────────────────────────────────────────────────────┐
│  CT │ claude-team-ws ▼ │ Board│Captures│Agents│Graph│Settings│ [+ Capture ⌘J] 🔔 TT │
├──────────────────────────────────────────────────────────────┤
│ ⚠ AGENT NEEDS INPUT — "Which search provider?" — [Answer] [✕]│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│              Main Content Area (full width)                  │
│              (changes based on active page)                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Header Navigation:**
- **Logo (CT)** + Project selector dropdown
- **Nav tabs:** Board | Captures | Agents | Graph | Settings
- **Actions:** [+ Capture ⌘J] CTA button, notification bell (🔔), user avatar (initials)

---

### Global Agent Alert Bar

When any agent in the project is in `waiting_input` state (AskUserQuestion), a red/amber alert bar appears **below the header, spanning the full content width**. Alert bar behavior:

- **Always visible** regardless of which page the user is on (Board, Agents, Graph, etc.)
- **Pulsing animation** (CSS `animate-pulse`) for visibility — the agent is blocked, waiting for human input
- **Displays**: Agent name + question (truncated) + [Answer] button + [✕] close button
- **Click [Answer]** → navigates to the agent's session page
- **If multiple agents waiting** → shows count: "2 agents need input" + dropdown list
- **Auto-dismiss** when the question is answered (human response or auto-timeout)
- **Browser notification** (if user has granted permission) + sound ping

```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 AGENT WAITING — BlueLake asks: "Which search prov…"      │
│                                          [Answer] [✕]        │
└──────────────────────────────────────────────────────────────┘
  ↑ Red/amber background, pulsing border, highest z-index
```

If 2+ agents waiting:
```
┌──────────────────────────────────────────────────────────────┐
│ 🔴 2 AGENTS NEED INPUT                            [View All] │
│   BlueLake: "Which search provider?"               [Answer]  │
│   RedStone: "Use JWT or session cookies?"          [Answer]  │
└──────────────────────────────────────────────────────────────┘
```

---

## Page 1: Epic Kanban Board (`/projects/:id/board`)

```
┌──────────────────────────────────────────────────────────────┐
│ Board ▼   │ Filter: [All Types ▼] [All Labels ▼] [Search…]  │
├──────────┬──────────┬──────────┬──────────┬─────────────────┤
│ Blocked  │  Ready   │ In Prog  │In Review │     Done        │
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
│ 🤖 running  @Bot    │  ← Agent status indicator (if active)
│ ▶ Start             │  ← Action button (if ready)
│ PR #45  🔍 review   │  ← PR status (if in review)
│                     │
│ @Minh  •  2h ago    │  ← Assignee + last updated
│ backend, security   │  ← Labels
└─────────────────────┘
```

**Card states:**
- Default: Drag-and-droppable between columns
- `🤖 running`: Agent is active. Click → opens Agent Stream panel
- `❓ Q&A`: Agent is waiting for human input. Click → opens Q&A dialog
- `▶ Start`: Ready to start. Click → opens Spawn dialog
- `PR #45`: PR has been created. Click → opens Review Module

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

## Page 2: Captures Page (`/captures`)

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ Captures   │  Pending: 4  │  Deferred: 2  │  [+ Capture ⌘J] │
├──────────────────────────────────────────────────────────────┤
│ [Pending]  [Deferred]  [All]                                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ☐ Need rate limiting for public API endpoints          │  │
│  │   @Trung • 5m ago • source: manual                     │  │
│  │                         [→ Triage] [Defer ▶] [Dismiss] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ☐ Bug: login fails on Safari                          │  │
│  │   @Minh • 1h ago • source: manual                      │  │
│  │                         [→ Triage] [Defer ▶] [Dismiss] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ☐ Refactor DB connection pool                          │  │
│  │   @Bot • 3h ago • source: agent                        │  │
│  │                         [→ Triage] [Defer ▶] [Dismiss] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ ☐ Add request logging middleware                       │  │
│  │   @Trung • 4h ago • source: manual                     │  │
│  │                         [→ Triage] [Defer ▶] [Dismiss] │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ ☑ 2 selected                     [Batch Triage] [Dismiss All]│
└──────────────────────────────────────────────────────────────┘
```

**Capture card actions:**
- **[→ Triage]**: Opens the Triage dialog (4-phase AI-assisted flow)
- **[Defer ▶]**: Moves to deferred list for later review
- **[Dismiss]**: Removes the capture (with confirmation)
- **Checkbox**: Select for batch operations

### Triage Dialog (4-Phase AI Flow)

```
┌──────────────────────────────────────────────────────────────┐
│  Triage Capture                                       [✕]    │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Capture: "Need rate limiting for public API endpoints"      │
│                                                              │
│  ── Phase 1: Classify ─────────────────────────────────────  │
│  Type:      [feature ▼]                                      │
│  Priority:  [P1 ▼]                                           │
│  Labels:    [backend, security, +]                           │
│                                                              │
│  ── Phase 2: Enrich (AI) ──────────────────────────────────  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ AI Suggestion:                                         │  │
│  │ Title: "Add rate limiting to public API endpoints"     │  │
│  │ Description: Add express-rate-limit middleware with     │  │
│  │ Redis backend for all /api/* routes. Configure per-    │  │
│  │ endpoint limits via config file.                       │  │
│  │                                              [Accept]  │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ── Phase 3: Scope ────────────────────────────────────────  │
│  Acceptance Criteria:                                        │
│  ☐ Rate limiter middleware created                           │
│  ☐ Redis integration for distributed limiting                │
│  ☐ Per-endpoint configuration                                │
│  ☐ Integration tests                                         │
│  [+ Add criterion]                                           │
│                                                              │
│  ── Phase 4: Create Epic ──────────────────────────────────  │
│  Repo:      [backend ▼]                                      │
│  Assignee:  [Unassigned ▼]                                   │
│                                                              │
│                              [Cancel]  [Create Epic]         │
└──────────────────────────────────────────────────────────────┘
```

---

## Page 3: Agent Sessions (`/projects/:id/agents`)

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

When an agent needs human input (mode=pause):

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

## Page 4: PR Review Module (`/projects/:id/review/:sessionId`)

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

## Page 5: Dependency Graph (`/projects/:id/graph`)

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

Located within the Settings page. PM/TechLead manages repositories.

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
| | | CaptureCard (captures page) |
| | | DiffViewer (PR review) |
| | | GraphView (React Flow wrapper) |
| | | ProgressBar (Epic progress) |
| | | QueueIndicator |

### Additional Libraries

| Library | Purpose |
|---------|---------|
| `@dnd-kit/core` + `@dnd-kit/sortable` | Kanban drag-and-drop |
| `@xyflow/react` | Dependency graph |
| `@dagrejs/dagre` | Auto-layout for DAG |
| `react-diff-viewer-continued` | PR diff rendering |
| `react-router-dom` | Client-side routing |
| `@tanstack/react-query` | Server state + cache |
| `zustand` | Client state |
| `socket.io-client` | Real-time communication |
| `date-fns` | Date formatting |
| `lucide-react` | Icons |
