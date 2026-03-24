# Board Page — Epic Kanban Board (`/board`)

## Overview

| Attribute | Value |
|-----------|-------|
| Route | `/board` |
| Page component | `pages/board-page.tsx` |
| Store | `stores/board-store.ts` (Zustand) |
| Mock data | `data/epics.ts`, `data/beads.ts`, `data/sessions.ts`, `data/users.ts` |
| API endpoints (production) | `GET /api/projects/:projectId/epics`, `GET /api/projects/:projectId/epics/:epicId`, `POST /api/projects/:projectId/epics`, `PATCH /api/projects/:projectId/epics/:epicId` |
| Socket.IO events | `epic:created`, `epic:updated`, `session:lifecycle`, `pr:event`, `beads:changed` |

---

## Component Tree

```
BoardPage
├── FilterBar
│   ├── Select (type filter)
│   ├── Select (label filter)
│   └── Input (search)
├── BoardColumn (x5: blocked, ready, in_progress, in_review, done)
│   └── EpicCard (x N per column)
│       └── PriorityBadge
├── EpicDetailSheet (overlay, controlled by board-store.selectedEpicId)
│   ├── PriorityBadge
│   ├── BeadList
│   │   ├── BeadRow (x N)
│   │   └── BeadDetailDialog (overlay per bead click)
│   └── [Tabs: Overview | Source Captures | Dep Tree]
└── EpicCreateDialog (overlay, controlled by local state)
    ├── CaptureSelectRow (x N pending captures)
    └── TriageDialog (4-phase AI triage — shared with captures page)
```

---

## Components

### `BoardPage` — `pages/board-page.tsx`

**State:**
- `createDialogOpen: boolean` — local state, controls `EpicCreateDialog`
- Board filters from `useBoardStore()`: `filterType`, `filterLabel`, `searchQuery`

**Data:**
- Imports `epics` and `columns` from `data/epics.ts` (mock)
- Production: `GET /api/projects/:projectId/epics` via TanStack Query

**Computed:**
- `filteredEpics` — `useMemo` over `epics` applying type filter, label filter, and search query (searches title + description, case-insensitive)

**Layout:**
- Top bar: page title "Epic Board" + `FilterBar` (left) + "+ Epic" button (right)
- Board: 5-column CSS grid (`grid-cols-5`) with horizontal overflow, each column renders `BoardColumn`
- Overlays: `EpicDetailSheet` (always mounted, visibility controlled by store) + `EpicCreateDialog` (conditional on `createDialogOpen`)

**User interactions:**
| Action | Behavior |
|--------|----------|
| Click "+ Epic" | Opens `EpicCreateDialog` |
| Filter by type/label/search | Updates `useBoardStore`, board re-filters |
| Click epic card | Sets `selectedEpicId` in store, opens `EpicDetailSheet` |

---

### `FilterBar` — `components/board/filter-bar.tsx`

**Props:** None (reads/writes `useBoardStore` directly)

**State from store:**
- `filterType: string` — `'all' | 'feature' | 'bug' | 'task' | 'docs'`
- `filterLabel: string` — `'all' | <any label>`
- `searchQuery: string`

**Computed:**
- `uniqueLabels` — extracted from `epics.flatMap(e => e.labels)`, sorted, deduped

**Rendered elements:**
1. Type `Select` — dropdown with all/feature/bug/task/docs
2. Label `Select` — dropdown populated from `uniqueLabels` dynamically
3. Search `Input` with magnifying glass icon, width 220px

**Production gap:** Labels are currently computed from mock data at module level. Production should derive from API response or a separate label endpoint.

---

### `BoardColumn` — `components/board/board-column.tsx`

**Props:**
```typescript
interface BoardColumnProps {
  columnId: UiStatus      // 'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done'
  label: string           // display name
  epics: Epic[]           // pre-filtered by parent
}
```

**Rendering:**
- Header: column label + count badge `(N)`
- Body: maps `epics` to `EpicCard` components
- Empty state: dashed border placeholder with "No epics" text

**Notes:**
- `columnId` is received but not currently used in the component body (only `label` and `epics` are used)
- No drag-and-drop implemented yet despite `dnd-kit` being mentioned in beads data. This is a gap.

---

### `EpicCard` — `components/board/epic-card.tsx`

**Props:**
```typescript
interface EpicCardProps {
  epic: Epic
}
```

**Data lookups:**
- `getUserById(epic.assigneeId)` — resolves avatar color/initials
- `useBoardStore().setSelectedEpicId` — click handler

**Conditional rendering:**

| Condition | Rendering |
|-----------|-----------|
| `epic.agentStatus === 'waiting_input'` | Amber border glow, amber background tint, "needs input" badge with pulsing dot |
| `epic.agentStatus === 'running'` | Green pulsing dot + "running" label |
| `epic.agentStatus === null/undefined` | No agent status section |
| `epic.uiStatus === 'in_review' && epic.prNumber` | "PR #N" link with ExternalLink icon |
| `epic.labels.length > 2` | Only first 2 labels shown |
| `progressPercent > 0` | Filled progress bar |

**Card layout (top to bottom):**
1. Top row: `PriorityBadge` + type badge (color-coded) | assignee avatar (right)
2. Title (truncated, single line)
3. Progress bar + "N/M beads" label
4. Agent status indicator (conditional)
5. PR link (conditional, in_review only)
6. Bottom row: relative timestamp (date-fns) | label badges (max 2)

**Type color mapping:**
- `feature` → blue
- `bug` → red
- `task` → green
- `docs` → purple

---

### `PriorityBadge` — `components/board/priority-badge.tsx`

**Props:**
```typescript
interface PriorityBadgeProps {
  priority: 0 | 1 | 2 | 3
  className?: string
}
```

**Priority styling:**
| Priority | Label | Color |
|----------|-------|-------|
| 0 | P0 | Red |
| 1 | P1 | Blue |
| 2 | P2 | Yellow |
| 3 | P3 | Gray |

---

### `EpicDetailSheet` — `components/board/epic-detail-sheet.tsx`

**State:**
- From store: `selectedEpicId`, `setSelectedEpicId`
- Local: `activeTab: 'overview' | 'sources' | 'dep-tree'`
- Local: `commentText`, `showComments`
- Local sidebar fields: `localStatus`, `localPriority`, `localType`, `localAssigneeId`, `localLabels`, `localDueDate`, `localEstimate`, `labelInput`, `showDueDateInput`, `showEstimateInput`

**Data lookups:**
- `epics.find(e => e.id === selectedEpicId)` — from mock data
- `sessions.filter(s => s.epicId === selectedEpicId)` — linked sessions
- `getUserById()` for assignee + comment authors

**Layout:** Full-width dialog (`max-w-5xl`, `w-[90vw]`) with three vertical sections:
1. **Header** — Priority badge, type badge, bead ID, title, tab bar
2. **Body** — Two-column layout:
   - Left (flex-1): Tab content (overview / sources / dep-tree)
   - Right (w-64): Metadata sidebar with interactive dropdowns
3. **Footer** — Status-aware action buttons

**Tabs:**

| Tab | Content |
|-----|---------|
| **Overview** | Description, acceptance criteria (checkable), `BeadList`, comments section |
| **Source Captures** | Cards showing original capture text, author, timestamp, attachments (images with hover preview, file badges) |
| **Dep Tree** | Indented tree visualization from demo data (simulated `br dep tree` output) |

**Right sidebar fields (all interactive via DropdownMenu):**
- Status — dropdown to change `ui_status`, maps to `PATCH /api/projects/:projectId/epics/:epicId`
- Priority — dropdown P0-P3, maps to `br update --priority`
- Type — dropdown feature/bug/task/docs
- Assignee — dropdown with user avatars, unassign option
- Labels — inline tag display with remove (x), input to add new labels
- Due date — inline date input, clearable
- Estimate — inline text input (e.g. "4h, 2d, 1w"), clearable
- Branch — `GitBranch` icon + code display (conditional on `epic.gitBranch`)
- Pull Request — link to PR with status badge (conditional on `epic.prUrl`)
- Sessions — clickable session cards with status dot, navigates to `/agents/:sessionId`
- Timestamps — created/updated dates

**Footer actions (status-aware):**

| `epic.uiStatus` | Primary action | Maps to |
|------------------|----------------|---------|
| `blocked` | "Blocked" (disabled) | — |
| `ready` | "Start Session" | `POST /api/projects/:projectId/sessions` |
| `in_progress` | "View Session" | Navigate to `/agents/:sessionId` |
| `in_review` | "Review PR" | Navigate to `/review/:prNumber` |
| `done` | "View Summary" | Toast only (demo) |

Additional footer buttons (always): Edit, Defer, Close/Reopen, Archive

**Comments section:**
- Toggle reveal via "Comments (N)" button
- Shows `demoComments` (hardcoded mock data with 2 comments)
- Input + send button for adding comments
- Production: `br comments add <epicBeadId> "<text>"`

**Production gaps:**
- All field changes fire `toast.success()` only — no API calls
- Acceptance criteria checked state uses hardcoded `checkedIndices = new Set([0, 2])`
- Dep tree uses hardcoded `demoDeps` array — should call `br dep tree <beadId> --json`
- Comments use hardcoded `demoComments` — should call `br comments list <beadId> --json`
- Local state resets via `useState()` callback (misuse) — should use `useEffect` keyed on `epicId`
- No optimistic updates or TanStack Query mutation integration

---

### `BeadList` — `components/board/bead-list.tsx`

**Props:**
```typescript
interface BeadListProps {
  epicId: string
}
```

**Data:**
- `getBeadsByEpicId(epicId)` from `data/beads.ts`
- Production: nested in epic detail response from `GET /api/projects/:projectId/epics/:epicId` (bead children via `br show`)

**Rendering:**
- Groups beads by status in order: `in_progress`, `blocked`, `open`, `done`
- Active beads (in_progress + blocked + open) always visible
- Done beads collapsed by default behind "Completed (N)" toggle
- Each bead renders as `BeadRow`
- Click on any bead opens `BeadDetailDialog`

**Status icons:**
| Status | Icon | Color | Extra |
|--------|------|-------|-------|
| `done` | CheckCircle2 | green | — |
| `open` | Circle | muted | — |
| `in_progress` | Loader2 | blue | `animate-spin` |
| `blocked` | Ban | red | Shows "Blocked by: <title>" below |

**Blocked beads:** resolve dependency IDs to titles via `getBeadById()` and display "Blocked by: X, Y" in red text.

---

### `BeadDetailDialog` — `components/board/bead-detail-dialog.tsx`

**Props:**
```typescript
interface BeadDetailDialogProps {
  bead: Bead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Sections (top to bottom):**
1. Bead ID (monospace), title
2. Status badge (dropdown to change), priority badge (dropdown to change), type badge
3. Description
4. Dependencies — list with status icons, add/remove buttons
5. Labels — inline tags with remove, add button
6. Assignee — dropdown with user list, unassign
7. Timestamps (created, updated)
8. Comments — toggle section with input
9. Status-aware action buttons:

| `bead.status` | Primary action | Maps to |
|---------------|----------------|---------|
| `open` + no assignee | "Claim" | `br update --claim` |
| `open` + assigned | "Start Session" | `POST /api/projects/:projectId/sessions` |
| `in_progress` | "In Progress" (view session) | — |
| `blocked` | "Blocked" (disabled) | — |
| `done` | "Completed" (disabled) | — |

Secondary actions: "Dep tree" (toast), "Close" (when not done) via `br close`

**Production gaps:** All actions fire `toast` only — no actual `br` CLI calls or API requests.

---

### `EpicCreateDialog` — `components/board/epic-create-dialog.tsx`

**Props:**
```typescript
interface EpicCreateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}
```

**Data:** Uses `useCaptureStore().captures` filtered to `status === 'pending'`

**Flow:**
1. Dialog shows list of pending captures with checkboxes
2. User searches/filters captures, selects one or more
3. Clicks "Start Triage (N)" — closes dialog, opens `TriageDialog`
4. `TriageDialog` runs 4-phase AI analysis (shared with captures page)
5. On completion, selected captures marked as `triaged`

**Sub-component: `CaptureSelectRow`** — inline in the file, renders a capture with checkbox, text, author avatar, and relative timestamp.

**Production integration:**
- Select captures → `POST /api/projects/:projectId/captures/:id` with `status: 'triaged'` + triage_result
- Triage creates epic → `POST /api/projects/:projectId/epics`

---

## Data Types

### `Epic` (from `data/epics.ts`)

```typescript
interface Epic {
  id: string
  beadId: string                    // maps to epics.bead_epic_id
  title: string                     // from br show (bead.title)
  description: string               // from br show (bead.description)
  uiStatus: UiStatus                // maps to epics.ui_status
  priority: 0 | 1 | 2 | 3          // from br show (bead.priority)
  type: EpicType                    // 'feature' | 'bug' | 'task' | 'docs'
  labels: string[]                  // from br show (bead.labels)
  assigneeId: string                // NOT in DB schema — resolved from bead.assignee
  beadProgress: { total: number; done: number }  // computed from children bead statuses
  agentStatus?: 'running' | 'waiting_input' | null  // from active session status
  activeSessionId?: string          // from sessions with matching epic_id + running status
  prUrl?: string                    // maps to sessions.pr_url
  prNumber?: number                 // parsed from prUrl
  prStatus?: string                 // maps to sessions.pr_status
  gitBranch?: string                // from epics.git_branches JSON
  createdAt: number                 // epoch seconds
  updatedAt: number                 // epoch seconds
  acceptanceCriteria?: string[]     // NOT in DB — could be in bead description or separate field
  sourceCaptures?: { ... }[]        // NOT directly in DB — join captures → epics via triage_result
}
```

### `UiStatus`
`'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done'`

### `Bead` (from `data/beads.ts`)

```typescript
interface Bead {
  id: string
  epicId: string              // foreign key to Epic
  title: string
  description: string
  status: BeadStatus          // 'open' | 'in_progress' | 'done' | 'blocked'
  priority: number            // 0-3
  type: BeadType              // 'task' | 'bug' | 'spike'
  assigneeId?: string
  labels: string[]
  dependencies: string[]      // bead IDs this depends on
  createdAt: number
  updatedAt: number
}
```

---

## Board Store (`stores/board-store.ts`)

```typescript
interface BoardState {
  selectedEpicId: string | null
  filterType: string         // 'all' | epic type
  filterLabel: string        // 'all' | label value
  searchQuery: string
  setSelectedEpicId: (id: string | null) => void
  setFilterType: (type: string) => void
  setFilterLabel: (label: string) => void
  setSearchQuery: (query: string) => void
}
```

UI-only state, correctly uses Zustand. No server data stored.

---

## API Mapping

| UI field | API endpoint | DB field |
|----------|-------------|----------|
| Epic list | `GET /api/projects/:projectId/epics` | `epics.*` + `br show` |
| Epic detail | `GET /api/projects/:projectId/epics/:epicId` | `epics.*` + `br show` (children, deps) |
| Create epic | `POST /api/projects/:projectId/epics` | Insert `epics`, `br create --type epic` |
| Update status | `PATCH /api/projects/:projectId/epics/:epicId` | `epics.ui_status` |
| Update priority | `PATCH /api/projects/:projectId/epics/:epicId` | `br update --priority` |
| Bead list | Nested in epic detail | `br show <epicBeadId> --json` → children |
| Bead actions | None exposed yet | `br update`, `br close`, `br dep add/remove` |
| Start session | `POST /api/projects/:projectId/sessions` | Insert `sessions` |
| Epic sessions | `GET /api/projects/:projectId/sessions?epic_id=X` | `sessions` filtered |
| Comments | None yet | `br comments list/add` |

---

## Socket.IO Integration

| Event | Room | UI behavior |
|-------|------|-------------|
| `epic:created` | `project:<id>` | Invalidate epic list query, new card appears |
| `epic:updated` | `project:<id>` | Invalidate epic query, card moves columns if status changed |
| `session:lifecycle` | `project:<id>` | Update agent status dot on epic cards |
| `pr:event` | `project:<id>` | Show PR badge on in_review cards |
| `beads:changed` | `project:<id>` | Refetch epic detail (bead progress may have changed) |
| `capture:created` | `project:<id>` | Update pending count in `EpicCreateDialog` |

**Current state:** No Socket.IO integration. All data is static mock.

---

## Accessibility Notes

- `EpicCard` renders as `<button>` — keyboard accessible, focusable
- `BeadRow` renders as `<button>` — keyboard accessible
- `EpicDetailSheet` uses radix `Dialog` — trap focus, Escape to close
- `BeadDetailDialog` uses radix `Dialog` — same
- `PriorityBadge` has color-only differentiation — needs text label (present as "P0"/"P1" etc., so accessible)
- Board columns have no ARIA landmarks — consider `role="region"` with `aria-label`
- No drag-and-drop keyboard support (feature gap)

---

## Gaps vs API/Events Spec

| Gap | Detail | Priority |
|-----|--------|----------|
| **No TanStack Query** | All data from static imports, not API calls | P0 — core integration |
| **No Socket.IO** | No real-time updates | P0 |
| **No drag-and-drop** | Columns exist but cards cannot be moved between them | P1 |
| **Hardcoded comments** | `demoComments` array, not from `br comments list` | P1 |
| **Hardcoded dep tree** | `demoDeps` array, not from `br dep tree` | P1 |
| **Hardcoded AC checked state** | `checkedIndices = new Set([0, 2])` | P2 |
| **No scope analysis** | Missing `POST /epics/:epicId/analyze-scope` integration | P1 |
| **No confirm-split** | Missing `POST /epics/:epicId/confirm-split` integration | P1 |
| **Type field** | Demo uses `'feature' | 'bug' | 'task' | 'docs'` but br uses `'task' | 'bug' | 'feature' | 'epic' | 'question' | 'docs'` | P2 |
| **BeadType mismatch** | Demo uses `'task' | 'bug' | 'spike'` but br has no `spike` type | P2 |
| **No error boundaries** | No TanStack Query error handling or fallback UI | P1 |
| **assigneeId source** | Not in `epics` DB table — must come from `br show` bead data | P2 |
| **sourceCaptures** | Not a direct DB field — requires join from `captures.triage_result` | P2 |
| **Due date / Estimate** | Fields in detail sheet but not in DB schema or API spec | P2 |
| **useState misuse** | `EpicDetailSheet` uses `useState()` callback for reset — should be `useEffect` | P1 |
| **acceptanceCriteria storage** | See WARNING below | P1 |

### WARNING: `acceptanceCriteria` Storage

> **WARNING NEEDS DECISION:** The `EpicDetailSheet` Overview tab renders `acceptanceCriteria` as a checkable list, but there is no definitive storage mechanism for this field. The options are:
>
> **(a)** Store acceptance criteria within the bead `description` field using a structured format (e.g., markdown checkboxes `- [ ] criterion`), parsed at read time.
>
> **(b)** Add a separate `acceptance_criteria` TEXT column to the `epics` table (stored as JSON array), requiring a Drizzle migration.
>
> **(c)** Drop acceptance criteria support from MVP entirely -- remove the checklist from the Overview tab.
>
> This must be decided before implementing the EpicDetailSheet. The demo currently uses a hardcoded array with hardcoded checked state (`checkedIndices = new Set([0, 2])`), which is not viable for production.

---

## Integration Checklist

- [ ] Replace `import { epics } from '@/data/epics'` with TanStack Query `useQuery(['epics', projectId], ...)`
- [ ] Replace `import { sessions } from '@/data/sessions'` with TanStack Query
- [ ] Replace `import { beads } from '@/data/beads'` with data nested in epic detail response
- [ ] Add Socket.IO listener for `epic:created` / `epic:updated` → invalidate query keys
- [ ] Add Socket.IO listener for `session:lifecycle` → update agent status on cards
- [ ] Add Socket.IO listener for `beads:changed` → refetch epic detail
- [ ] Implement drag-and-drop with dnd-kit (status change on drop → `PATCH /epics/:id`)
- [ ] Wire all `toast.success()` handlers to actual API mutations
- [ ] Add `useMutation` for epic create/update/close/archive
- [ ] Add `useMutation` for bead status/priority/assignee changes
- [ ] Fix `EpicDetailSheet` state reset to use `useEffect` keyed on `epicId`
- [ ] Add loading skeletons for epic cards during fetch
- [ ] Add error boundary with retry for failed fetches
- [ ] Add optimistic updates for status changes
