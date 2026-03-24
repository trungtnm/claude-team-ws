# Captures Page — Captures Triage (`/captures`)

## Overview

| Attribute | Value |
|-----------|-------|
| Route | `/captures` |
| Page component | `pages/captures-page.tsx` |
| Store | `stores/capture-store.ts` (Zustand) |
| Mock data | `data/captures.ts`, `data/users.ts` |
| API endpoints (production) | `GET /api/projects/:projectId/captures`, `POST /api/projects/:projectId/captures`, `PATCH /api/projects/:projectId/captures/:captureId`, `DELETE /api/projects/:projectId/captures/:captureId` |
| Socket.IO events | `capture:created` (server→client), `capture:create` (client→server) |
| Related components | `CaptureComposer` (global dialog from header), `CaptureInbox` (sidebar widget, currently unused) |

---

## Component Tree

```
CapturesPage
├── CaptureCard (x N per tab)
├── TriageDialog (overlay, triggered by single or batch triage)
│   └── [4 phases: review → processing → question → complete]
└── [Batch actions bar — appears when selection > 0]

CaptureComposer (mounted globally, not child of CapturesPage)
├── Textarea with drag-drop zone
├── Attachment previews
└── Collapsible Priority & Type selectors

CaptureInbox (sidebar widget, exists but currently unused in layout)
```

---

## Capture Lifecycle

```
User creates capture
    │
    ▼
[pending] ──── Triage ────► [triaged] ──► Epic created on board
    │                            │
    │── Defer ──► [deferred]     └── auto: br create --type epic
    │                                      + insert epics table
    └── Dismiss ──► [dismissed]            + Socket.IO epic:created
```

**Statuses:** `pending` → `triaged` | `deferred` | `dismissed`

---

## Components

### `CapturesPage` — `pages/captures-page.tsx`

**State:**
- From URL: `searchParams.get('highlight')` — highlights a specific capture (used by `CaptureInbox` sidebar navigation)
- Local: `activeTab: 'pending' | 'deferred' | 'all'`
- Local: `triageCaptures: Capture[]` — captures being triaged (single or batch)
- Local: `triageCapture: Capture | null` — legacy single-capture handler (unused but retained)
- From store: `captures`, `selectedIds`, `toggleSelected`, `selectAll`, `clearSelection`, `updateStatus`, `dismissCapture`, `openComposer`

**Computed lists:**
- `pendingCaptures` — `captures.filter(c => c.status === 'pending')`
- `deferredCaptures` — `captures.filter(c => c.status === 'deferred')`
- `allCaptures` — `captures.filter(c => c.status !== 'dismissed')` (includes triaged)
- `displayedCaptures` — switches on `activeTab`

**Selection clears** on tab change via `useEffect`.

**Layout (top to bottom):**
1. **Header row:** Title "Captures" + pending/deferred count badges | "+ Capture" button (opens composer)
2. **Filter tabs:** Pending (N) | Deferred (N) | All (N) + "Select all / Deselect all" toggle
3. **Captures list:** Scrollable area with `CaptureCard` per capture
4. **Empty state:** Inbox icon + "All caught up" message when no captures in current tab
5. **Batch actions bar:** Appears when `selectedIds.size > 0`, slides in with animation

**Tab counts:**
| Tab | Source | Filterable in production |
|-----|--------|--------------------------|
| Pending | `captures.filter(status === 'pending')` | `GET /captures?status=pending` |
| Deferred | `captures.filter(status === 'deferred')` | `GET /captures?status=deferred` |
| All | `captures.filter(status !== 'dismissed')` | `GET /captures` (exclude dismissed server-side) |

**Batch operations:**

| Action | Button | Behavior | API |
|--------|--------|----------|-----|
| Triage All | Primary | Collects selected pending captures, opens `TriageDialog` | `PATCH /captures/:id` per capture |
| Defer All | Secondary | Sets all selected to `deferred` | `PATCH /captures/:id` per capture |
| Dismiss All | Ghost | Sets all selected to `dismissed` | `DELETE /captures/:id` per capture |

**User interactions:**

| Action | Behavior |
|--------|----------|
| Click "+ Capture" button | Opens `CaptureComposer` dialog via `openComposer()` |
| Click tab | Switches displayed list, clears selection |
| Click "Select all" | Toggles selection of all visible captures |
| Click batch "Triage All" | Opens `TriageDialog` with selected captures |
| Single card Triage | Opens `TriageDialog` with one capture |

---

### `CaptureCard` — `components/capture/capture-card.tsx`

**Props:**
```typescript
interface CaptureCardProps {
  capture: Capture
  onTriage: (capture: Capture) => void
  onDefer: (id: string) => void
  onDismiss: (id: string) => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
  highlighted?: boolean
}
```

**Visual features:**

| Feature | Implementation |
|---------|---------------|
| **Age indicator** | Left border color based on capture age: < 1h → accent (blue), < 24h → muted, > 24h → error/red |
| **Highlight ring** | `ring-2 ring-accent/40` when `highlighted` prop is true (from URL query) |
| **Selected state** | Background changes to `bg-surface-elevated` |
| **Checkbox** | Standard HTML checkbox, shown when `onToggleSelect` is provided |

**Layout:**
- Left: Checkbox (conditional)
- Center: Capture text + author row (avatar, name, relative timestamp via date-fns)
- Right: Action buttons (always visible, not hover-only)

**Action buttons:**
| Button | Icon | Style | Maps to |
|--------|------|-------|---------|
| Triage | ArrowRight | Accent bg, prominent | `PATCH /captures/:id` + triage flow |
| Defer | Clock | Muted, subtle | `PATCH /captures/:id { status: 'deferred' }` |
| Dismiss | X | Muted, red on hover | `DELETE /captures/:id` |

---

### `CaptureComposer` — `components/capture/capture-composer.tsx`

**State:**
- From store: `composerOpen`, `closeComposer`, `addCapture`
- Local: `text`, `priority`, `captureType`, `attachments`, `isDragOver`, `showClassification`
- Refs: `fileInputRef`, `textareaRef`

**This is a global dialog** opened from the header "+ Capture" button or the captures page button. It is mounted at the app layout level, not inside `CapturesPage`.

**Layout sections:**

1. **Header:** "Capture an Idea" title + description
2. **Main textarea:**
   - Drag-drop zone (visual feedback with dashed border + "Drop files here" overlay)
   - Paste handler (intercepts clipboard for images/files)
   - Character count display
   - Inline toolbar: "Attach file" + "Add image" buttons (both open file picker)
3. **Attachment previews:** Thumbnail for images, icon+name for files, removable
4. **Classification section (collapsible):**
   - Marked as "Optional" badge
   - Two-column grid:
     - Priority selector: P0-P3 with descriptions, toggle-select
     - Type selector: Feature/Bug/Task/Question with icons and descriptions, toggle-select
5. **Footer:** Tip text + Cancel / "Capture & Add Another" / "Capture" buttons

**File support:**
- Accept: `image/*`, `.pdf`, `.txt`, `.log`, `.json`, `.csv`
- Drag-and-drop onto textarea area
- Paste screenshots with Cmd+V
- File picker via hidden `<input type="file" multiple>`

**Priority options:**
| Value | Label | Description |
|-------|-------|-------------|
| 0 | P0 -- Critical | Blocking work, needs immediate attention |
| 1 | P1 -- High | Important, address this sprint |
| 2 | P2 -- Medium | Plan when capacity allows |
| 3 | P3 -- Low | Backlog, revisit later |

**Type options:**
| Value | Icon | Description |
|-------|------|-------------|
| Feature | Lightbulb | New functionality or enhancement |
| Bug | Bug | Something broken that needs fixing |
| Task | Wrench | Technical work, refactor, or chore |
| Question | HelpCircle | Needs discussion or clarification |

**Submit flows:**
- "Capture": adds capture, resets form, closes dialog, shows toast
- "Capture & Add Another": adds capture, resets form, keeps dialog open, refocuses textarea

**Production API mapping:**
- `addCapture(text, meta)` → `POST /api/projects/:projectId/captures` with `{ text, priority?, type? }`
- Attachments: NOT handled by current API spec — need file upload endpoint
- Server-side: `capture:created` Socket.IO event emitted

**Production gaps:**
- Attachments stored in local state only — no upload API defined
- `addCapture` hardcodes `userId: 'u-1'` — should use authenticated user
- Priority/type hints passed as metadata but not stored in mock or API response

---

### `CaptureInbox` — `components/capture/capture-inbox.tsx`

**Status:** Exists but currently unused in the main layout. Was designed as a sidebar widget.

**Data:** Reads `useCaptureStore().captures`, filters to pending, shows first 3.

**Layout:**
- Header: Inbox icon + "Captures" label + pending count badge
- Preview list: First 3 pending captures, truncated to 1 line each
- Footer: "View all captures" link → navigates to `/captures`

**Click behavior:** Each preview navigates to `/captures?highlight=<captureId>`

---

### `TriageDialog` — `components/capture/triage-dialog.tsx`

**Props:**
```typescript
interface TriageDialogProps {
  captures: Capture[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onTriaged: (captureIds: string[]) => void
}
```

**Used by both:**
- `CapturesPage` — single or batch triage
- `EpicCreateDialog` (board page) — triage selected captures into epic

**4-Phase Flow:**

#### Phase 1: `review`
- Shows selected captures with author avatars and timestamps
- "AI-powered triage" card explaining what Claude Code will do
- "Start Triage" button triggers processing

#### Phase 2: `processing`
- 5-step progress indicator with animated checkmarks:
  1. "Analyzing capture content..."
  2. "Searching codebase for related patterns..."
  3. "Querying CASS for similar past sessions..."
  4. "Evaluating scope and dependencies..."
  5. "Generating Epic structure..."
- Each step auto-advances after 800-1400ms (simulated)
- After all steps: transitions to `question` phase

#### Phase 3: `question`
- Shows agent question with Bot avatar in accent-bordered card
- Context line in monospace (e.g., "Analyzing code impact across packages/...")
- Multiple-choice options as selectable buttons
- "Skip -- let agent decide" text link
- "Continue" button (disabled until option selected)
- Previous answers section below separator
- After answering all questions (2 in demo): brief processing, then `complete`

**Simulated questions (demo):**
1. Full-stack vs split epic scoping
2. Dedicated testing bead vs inline testing

#### Phase 4: `complete`
- Epic summary card (green border): type badge, priority badge, effort estimate, title, description, labels
- Beads breakdown: numbered list with title, type badge, priority badge
- Action buttons:
  - "Start Agent Session" (ghost) — navigates to `/agents`
  - "Close" (outline)
  - "View on Board" (primary) — navigates to `/board?epic=epic-new-triage`

**Production API mapping:**
| Phase | API call |
|-------|----------|
| Processing | `POST /api/projects/:projectId/epics/:epicId/analyze-scope` |
| Questions | `session:question` Socket.IO event pattern (or REST endpoint) |
| Complete | `POST /api/projects/:projectId/epics` + `POST /epics/:epicId/confirm-split` |
| Mark triaged | `PATCH /api/projects/:projectId/captures/:id { status: 'triaged', triage_result: {...} }` |

**Production gaps:**
- All processing is simulated with `setTimeout` — no actual AI analysis
- Questions are hardcoded (`simulatedQuestions`) — should come from agent
- Result is hardcoded (`simulatedResult`) — should come from agent analysis
- No abort/cancel during processing
- No error handling for failed triage

---

## Data Types

### `Capture` (from `data/captures.ts`)

```typescript
interface Capture {
  id: string
  text: string
  userId: string
  status: CaptureStatus    // 'pending' | 'triaged' | 'deferred' | 'dismissed'
  createdAt: number        // epoch seconds
}
```

**DB mapping (`captures` table):**

| Mock field | DB column | Notes |
|-----------|-----------|-------|
| `id` | `id` (TEXT PK) | UUID v4 |
| `text` | `text` (TEXT NOT NULL) | |
| `userId` | `user_id` (TEXT FK) | |
| `status` | `status` (TEXT) | `'pending' | 'triaged' | 'deferred' | 'dismissed'` |
| `createdAt` | `created_at` (INTEGER) | epoch seconds |
| — | `project_id` (TEXT FK) | Missing from mock — needed in production |
| — | `triage_result` (TEXT) | JSON, missing from mock |
| — | `triaged_at` (INTEGER) | Missing from mock |
| — | `triaged_by` (TEXT FK) | Missing from mock |

---

## Capture Store (`stores/capture-store.ts`)

```typescript
interface CaptureState {
  captures: Capture[]
  composerOpen: boolean
  selectedIds: Set<string>
  addCapture: (text: string, meta?: { priority?: number; type?: string }) => void
  updateStatus: (id: string, status: CaptureStatus) => void
  dismissCapture: (id: string) => void
  openComposer: () => void
  closeComposer: () => void
  toggleComposer: () => void
  toggleSelected: (id: string) => void
  selectAll: (ids: string[]) => void
  clearSelection: () => void
  getPendingCaptures: () => Capture[]
  getDeferredCaptures: () => Capture[]
  getNextPendingCapture: (afterId?: string) => Capture | undefined
}
```

**Notes:**
- Initialized with `initialCaptures.filter(c => c.status !== 'triaged')` — pre-filters triaged
- `addCapture` hardcodes `userId: 'u-1'` — must use auth context in production
- `dismissCapture` updates status to `dismissed` AND removes from `selectedIds`
- `composerOpen` manages global composer dialog state
- **Violates conventions:** Stores server data (`captures`) in Zustand. Production should use TanStack Query for captures, Zustand only for `composerOpen` and `selectedIds`.

---

## API Mapping

| UI action | API endpoint | Side effects |
|-----------|-------------|--------------|
| Load captures | `GET /api/projects/:projectId/captures?status=pending` | — |
| Create capture | `POST /api/projects/:projectId/captures` | Socket.IO `capture:created` |
| Triage capture | `PATCH /api/projects/:projectId/captures/:id` with `triage_result` | May auto-create epic |
| Defer capture | `PATCH /api/projects/:projectId/captures/:id` with `status: 'deferred'` | — |
| Dismiss capture | `DELETE /api/projects/:projectId/captures/:id` | — |
| Quick create (Socket) | Client emit `capture:create` | Server inserts + emits `capture:created` |

---

## Socket.IO Integration

| Event | Direction | UI behavior |
|-------|-----------|-------------|
| `capture:created` | server→client | Add new capture to pending list, update count badge |
| `capture:create` | client→server | Alternative to POST for quick capture (no attachments) |

**Current state:** No Socket.IO integration. All mutations are local store updates.

---

## Accessibility Notes

- Capture cards use standard `<div>` — action buttons inside are focusable
- Checkbox is native `<input type="checkbox">` — keyboard accessible
- Filter tabs are `<button>` elements — keyboard navigable
- Batch action bar uses `<Button>` components — focusable
- Composer dialog uses radix `Dialog` — focus trap, Escape to close
- Triage dialog uses radix `Dialog` — focus trap
- Textarea has associated label text (above, not `<label htmlFor>` — could improve)
- File drop zone has no screen reader announcement for drag state

---

## Gaps vs API/Events Spec

| Gap | Detail | Priority |
|-----|--------|----------|
| **No TanStack Query** | Captures stored in Zustand, not fetched from API | P0 |
| **No Socket.IO** | No real-time capture creation events | P0 |
| **No file upload** | Composer supports attachments locally but API has no upload endpoint | P1 |
| **No project scoping** | `project_id` not used — all captures are global | P1 |
| **Hardcoded triage AI** | `TriageDialog` uses simulated steps/questions/results | P1 |
| **Missing triage_result** | Capture mock has no `triage_result` field | P1 |
| **Missing triaged_at/by** | Capture mock missing triage metadata | P2 |
| **No pagination** | All captures loaded at once — API supports `limit`/`offset` | P2 |
| **getNextPendingCapture unused** | Store method exists but no longer called | P3 |
| **Hardcoded userId** | `addCapture` always uses `'u-1'` | P1 |
| **No optimistic updates** | Status changes are instant (local) but should be optimistic with rollback | P2 |

---

## Integration Checklist

- [ ] Replace `useCaptureStore().captures` with `useQuery(['captures', projectId, status], ...)`
- [ ] Move `composerOpen` and `selectedIds` to a UI-only Zustand store (no server data)
- [ ] Wire `addCapture` to `POST /api/projects/:projectId/captures` mutation
- [ ] Wire `updateStatus` to `PATCH /api/projects/:projectId/captures/:id` mutation
- [ ] Wire `dismissCapture` to `DELETE /api/projects/:projectId/captures/:id` mutation
- [ ] Add Socket.IO listener for `capture:created` → invalidate query
- [ ] Add file upload endpoint and wire composer attachments
- [ ] Add `project_id` context from URL params or app-level context
- [ ] Wire `TriageDialog` to actual AI analysis endpoints (`analyze-scope`, `confirm-split`)
- [ ] Add pagination support (infinite scroll or load more)
- [ ] Add loading skeletons during fetch
- [ ] Add error handling with retry
- [ ] Remove unused `getNextPendingCapture` and `_handleTriageNext`
