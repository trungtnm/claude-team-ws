# Layout & Shared Components Spec

---

## App Shell (`components/layout/layout.tsx`)

The app uses a **vertical stack layout** with no sidebar:

```
+---------------------------------------------------+
|  Header (48px, fixed top)                         |
+---------------------------------------------------+
|  AgentAlertBar (conditional, amber pulsing)       |
+---------------------------------------------------+
|                                                   |
|  <Outlet /> (flex-1, overflow-auto)               |
|  (page content fills remaining height)            |
|                                                   |
+---------------------------------------------------+
|  Toaster (sonner, fixed bottom-right)             |
+---------------------------------------------------+
```

**Key layout decisions:**
- `h-screen flex flex-col` on root container -- pages fill viewport height
- No sidebar navigation -- all nav is in the header tabs (differs from original wireframe which showed a sidebar)
- Toaster uses dark theme with Warm Workshop colors inline-styled

---

## Header (`components/layout/header.tsx`)

48px horizontal bar (`h-12`), border-bottom, surface-base background.

### Sections (left to right):

1. **Logo + Project Selector**
   - 28px amber square with "CT" text
   - DropdownMenu trigger: project name ("claude-team-ws") + chevron
   - Mock projects: `proj-1` (claude-team-ws), `proj-2` (acme-dashboard)
   - Selection is visual-only in demo (no state change)

2. **Navigation Tabs** (5 items, `ml-6`)
   - Board (`/board`, LayoutDashboard icon)
   - Captures (`/captures`, Inbox icon)
   - Agents (`/agents`, Bot icon)
   - Graph (`/graph`, GitBranch icon)
   - Settings (`/settings`, Settings icon)
   - Uses `NavLink` with `isActive` for accent highlight
   - Active: `bg-surface-elevated text-ink`
   - Inactive: `text-ink-muted hover:text-ink-secondary`

3. **Right Actions**
   - **Capture CTA Button**: Accent colored, `Plus` icon, "Capture" label, `Cmd+J` kbd hint (hidden on small screens). Calls `toggleComposer()` from `useCaptureStore`.
   - **NotificationDropdown**: Bell icon with unread count badge
   - **User Avatar**: 28px circle, amber background, "TT" initials (hardcoded to current user)

### Keyboard Shortcut
- `Cmd+J` / `Ctrl+J` toggles the capture composer dialog (registered via `useEffect` with keydown listener)

### Rendered Dialogs
- `CaptureComposer` is rendered inside the header (Dialog-based, always in DOM, controlled by `composerOpen` store state)

---

## Agent Alert Bar (`components/layout/agent-alert-bar.tsx`)

Rendered between Header and main content. Conditionally shown when `getWaitingSessions().length > 0` and not dismissed.

### Single agent waiting:
```
+---------------------------------------------------+
| ! AGENT WAITING  BlueLake  "Which cache inval..." |
|                              [Answer] [X]         |
+---------------------------------------------------+
```
- Amber border, amber/10 background
- `animate-pulse-warm` CSS animation (border color oscillates)
- "Answer" button navigates to `/agents/${session.id}`
- X button dismisses (local state, resets on page nav)

### Multiple agents waiting:
```
+---------------------------------------------------+
| ! AGENT WAITING  2 agents need input  [View All]  |
+---------------------------------------------------+
```
- "View All" navigates to `/agents`

### Data source:
- `getWaitingSessions()` from `data/sessions.ts` -- returns sessions with `status === 'waiting_input'`

### Production mapping:
- Socket.IO `session:question` event would add to waiting list
- `session:question:answered` event would remove
- Should use TanStack Query subscription to session state

---

## Notification Dropdown (`components/layout/notification-dropdown.tsx`)

### Trigger
- Ghost button with Bell icon, `h-8 w-8`
- Red badge (`-top-0.5 -right-0.5`) showing unread count when > 0

### Dropdown Content (280px wide)
- Header: "Notifications" label + "Mark all read" link (when unread > 0)
- Scrollable list (max-h-80) of notification items
- Each item: type-specific icon, title (bold if unread), body (truncated), time ago, unread dot (accent color)
- Click: marks as read + navigates to `notification.link` + closes dropdown
- Footer: "View all notifications" link (shows toast "coming soon")

### Notification Type Icons
| Type | Icon |
|------|------|
| `agent_complete` | Bell |
| `pr_ready` | GitPullRequest |
| `review_needed` | MessageSquare |
| `question_waiting` | HelpCircle |
| `merge_complete` | GitMerge |

### State
- Local `useState` for items and open state
- `handleMarkAllRead`: sets all items to `read: true`
- `handleClickNotification`: marks individual item as read, closes dropdown, navigates

### Production mapping:
- Socket.IO `notification` event on `user:<userId>` room
- TanStack Query for `GET /api/notifications`
- `PATCH /api/notifications/:id` for mark as read
- `POST /api/notifications/mark-all-read` for bulk

---

## Capture Composer (`components/capture/capture-composer.tsx`)

Dialog-based composer (replaced the old FAB + inline card pattern). Controlled by `useCaptureStore.composerOpen`.

### Layout
- Max-width: `max-w-2xl`, max-height: `85vh`, scrollable
- Title: "Capture an Idea"
- Description: "Quickly log a thought, bug, or feature request. Your team will triage it into an Epic."

### Input Area
- Textarea (5 rows) with drag-and-drop zone
- Drag overlay: "Drop files here" with Upload icon
- Paste handler: intercepts clipboard items of kind `file`
- Inline toolbar below textarea: "Attach file" (Paperclip), "Add image" (Image), character count
- Hidden `<input type="file">` for attach/image buttons
- Accepted types: `image/*,.pdf,.txt,.log,.json,.csv`
- Placeholder text provides guidance on specificity

### Attachment Previews
- Image attachments: 40x40 thumbnail
- Other files: icon (FileText for PDF, generic File otherwise) + name + size
- Each has remove button

### Classification Section (collapsible)
- Toggleable via chevron button
- "Optional" badge
- Two-column grid: Priority (P0-P3 radio cards with descriptions) + Type (Feature/Bug/Task/Question radio cards with icons)
- Selections are optional hints -- can be changed during triage

### Actions
- "Cancel" (ghost) -- closes dialog
- "Capture & Add Another" (outline) -- submits, resets form, refocuses textarea, keeps dialog open
- "Capture" (primary) -- submits, resets form, closes dialog
- Both show toast on success

### Data Flow
- Calls `addCapture(text, { priority?, type? })` from store
- Store creates a new `Capture` with `cap-${Date.now()}` ID, `userId: 'u-1'`, `status: 'pending'`
- Prepends to captures array

---

## Capture FAB (`components/capture/capture-fab.tsx`)

**Note:** This component exists in the codebase but is NOT rendered in the current layout. The header "Capture" CTA button replaced it. Kept for reference.

- Fixed position bottom-right (`fixed bottom-6 right-6 z-50`)
- 56px amber circle with Plus/X icon (rotates 45deg when open)
- Pulse animation when no pending captures
- Same `Cmd+J` shortcut (duplicated -- would conflict with header handler)

---

## Router Configuration (`app.tsx`)

All routes are wrapped in `<Layout />` (provides header + alert bar + outlet).

| Path | Component | Lazy | Note |
|------|-----------|------|------|
| `/` | `Navigate to /board` | N/A | Redirect |
| `/board` | `BoardPage` | Yes | Named export destructured |
| `/captures` | `CapturesPage` | Yes | Default export |
| `/agents` | `AgentsPage` | Yes | Default export |
| `/agents/:sessionId` | `AgentStreamPage` | Yes | Default export |
| `/graph` | `GraphPage` | Yes | Default export |
| `/settings` | `SettingsPage` | Yes | Default export |
| `/review/:prNumber` | `PrReviewPage` | Yes | Default export |

Suspense fallback: centered "Loading..." text in `text-ink-muted`.

**Missing from wireframes:** The original wireframes showed `/projects/:id/board` (project-scoped routes). The demo uses flat routes without project scoping. Production will need nested `/projects/:projectId/...` routes.

---

## Design Tokens (`index.css` -- Warm Workshop Theme)

### Surfaces (dark, warm-tinted)
| Token | Value | Usage |
|-------|-------|-------|
| `--surface-base` | `#141210` | Page background, body |
| `--surface-raised` | `#1c1a17` | Cards, panels |
| `--surface-elevated` | `#221f1b` | Hover states, active items |
| `--surface-overlay` | `#2a2622` | Dropdowns, dialogs background |

### Accent (amber)
| Token | Value | Usage |
|-------|-------|-------|
| `--accent` | `#f59e0b` | Primary action color, CTA buttons |
| `--accent-hover` | `#f97316` | Hover state for accent |
| `--accent-muted` | `rgba(245,158,11,0.15)` | Selected item backgrounds |
| `--accent-subtle` | `rgba(245,158,11,0.08)` | Very subtle accent tint |

### Text Hierarchy
| Token | Value | Usage |
|-------|-------|-------|
| `--text-primary` / `ink` | `#f5f0eb` | Primary text |
| `--text-secondary` / `ink-secondary` | `#a8a29e` | Secondary text |
| `--text-muted` / `ink-muted` | `#78716c` | Muted labels |
| `--text-disabled` / `ink-disabled` | `#57534e` | Disabled text |

### Borders
| Token | Value | Usage |
|-------|-------|-------|
| `--border-default` / `edge` | `rgba(168,162,158,0.12)` | Card borders, separators |
| `--border-hover` / `edge-hover` | `rgba(168,162,158,0.20)` | Hover borders |
| `--border-focus` / `edge-focus` | `rgba(245,158,11,0.50)` | Focus rings |
| `--border-subtle` | `rgba(168,162,158,0.06)` | Very subtle borders |

### Priority Colors
| Token | Value | Label |
|-------|-------|-------|
| `--priority-p0` / `p0` | `#ef4444` | P0 Critical (red) |
| `--priority-p1` / `p1` | `#3b82f6` | P1 High (blue) |
| `--priority-p2` / `p2` | `#eab308` | P2 Medium (yellow) |
| `--priority-p3` / `p3` | `#6b7280` | P3 Low (gray) |

### Status Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--status-running` | `#22c55e` | Running sessions |
| `--status-waiting` | `#f59e0b` | Waiting for input |
| `--status-queued` | `#6b7280` | Queued sessions |
| `--status-completed` | `#22c55e` | Completed sessions |
| `--status-failed` | `#ef4444` | Failed sessions |

### Semantic
| Token | Value |
|-------|-------|
| `--success` | `#22c55e` |
| `--warning` | `#f59e0b` |
| `--error` | `#ef4444` |
| `--info` | `#3b82f6` |

### Shadows
| Token | Value |
|-------|-------|
| `--shadow-card` | `0 1px 3px rgba(20,18,16,0.4), 0 1px 2px rgba(20,18,16,0.3)` |
| `--shadow-elevated` | `0 4px 12px rgba(20,18,16,0.5), 0 2px 4px rgba(20,18,16,0.3)` |
| `--shadow-dialog` | `0 8px 32px rgba(20,18,16,0.7)` |

### Radius
| Token | Value |
|-------|-------|
| `--radius-sm` | 6px |
| `--radius-md` | 8px |
| `--radius-lg` | 12px |
| `--radius-xl` | 16px |

### Custom Animations

| Name | Purpose | Duration |
|------|---------|----------|
| `pulse-warm` | Agent alert bar border pulsing | 2s ease-in-out infinite |
| `blink` | Typing cursor in agent stream | 1s step-end infinite |
| `fab-pulse` | Capture FAB glow pulsing | 2s ease-in-out infinite |
| `composer-in` | Capture composer slide-in | 150ms ease-out (one-shot) |

### Scrollbar Styling
- WebKit: 6px width/height, transparent track, muted thumb with hover state
- Firefox: `scrollbar-width: thin`, `scrollbar-color: rgba(168,162,158,0.2) transparent`

### Font Stack
```
-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif
```
With antialiasing enabled on both webkit and Firefox.

---

## shadcn/ui Primitives (13 components)

All located in `components/ui/`. Standard shadcn/ui patterns with Warm Workshop theme colors applied via CSS variables.

### Badge Variants (custom)
| Variant | Style |
|---------|-------|
| `default` | surface-elevated bg, ink-secondary text |
| `accent` | accent/15 bg, accent text |
| `outline` | transparent bg, edge border, ink-secondary text |
| `success` | success/15 bg, success text |
| `warning` | warning/15 bg, warning text |
| `error` | error/15 bg, error text |
| `info` | info/15 bg, info text |

### Button Variants
| Variant | Style |
|---------|-------|
| `default` | accent bg, surface-base text |
| `secondary` | surface-elevated bg, ink-secondary text |
| `outline` | transparent bg, edge border |
| `ghost` | transparent bg, hover:surface-elevated |

### Button Sizes
| Size | Dimensions |
|------|-----------|
| `default` | h-9, px-4 |
| `sm` | h-8, px-3 |
| `icon` | h-9, w-9 |

---

## Toast Configuration (Sonner)

Rendered in `Layout`:
```tsx
<Toaster
  theme="dark"
  position="bottom-right"
  toastOptions={{
    style: {
      background: '#1c1a17',     // surface-raised
      border: '1px solid rgba(168,162,158,0.12)',  // edge
      color: '#f5f0eb',          // ink
    },
  }}
/>
```

Used throughout the app via `toast()`, `toast.success()`, `toast.error()`, `toast.info()` from sonner.

---

## Beads Sync Conflict Banner

A **persistent red banner** rendered between the Header and AgentAlertBar (or replacing AgentAlertBar's position when no agent alerts). Shown when the `beads:sync_conflict` Socket.IO event is received on the `project:<id>` room.

### Layout
```
+---------------------------------------------------+
|  Header (48px, fixed top)                         |
+---------------------------------------------------+
|  🔴 BEADS SYNC CONFLICT  Manual resolution needed |
|     "Beads git sync failed — TechLead resolve..." |
|                                        [Dismiss]  |
+---------------------------------------------------+
|  AgentAlertBar (conditional, amber pulsing)       |
+---------------------------------------------------+
|  <Outlet />                                       |
+---------------------------------------------------+
```

### Visual
- **Red** border and `error/10` background (contrast with AgentAlertBar's amber)
- No pulse animation (static alert, not a transient state)
- Error icon (AlertTriangle or XCircle in red)
- Shows `error` message from event payload
- Shows `host_command` as a copyable code block for TechLead

### Dismissal
- Banner **only dismisses** when the client receives `beads:sync_resolved` event on the same project room
- No manual dismiss button (conflict requires resolution, not acknowledgment)
- On `beads:sync_resolved`: banner fades out, optionally show success toast "Beads sync restored"

### Event payload (from `04-socket-io-events.md`)
```typescript
// beads:sync_conflict
{
  error: string
  details: string
  action_required: 'TechLead needs to resolve manually on host'
  host_command: string
  timestamp: number
}

// beads:sync_resolved
{
  timestamp: number
}
```

### Production mapping
- Listen on `project:<projectId>` room for `beads:sync_conflict` and `beads:sync_resolved`
- Store conflict state in a Zustand store or React context (not TanStack Query -- this is UI state driven by socket events)

---

## Shared Reusable Components

The following components are used across multiple pages. They are defined in specific page directories in the demo but should be extracted to shared locations in production.

### PriorityBadge

Currently in `components/board/priority-badge.tsx`. Used by: Board (EpicCard, EpicDetailSheet), and could be used by Captures (triage), Agents (session priority).

```typescript
interface PriorityBadgeProps {
  priority: 0 | 1 | 2 | 3
  className?: string
}
```

| Priority | Label | Color token |
|----------|-------|-------------|
| 0 | P0 | `--priority-p0` (red) |
| 1 | P1 | `--priority-p1` (blue) |
| 2 | P2 | `--priority-p2` (yellow) |
| 3 | P3 | `--priority-p3` (gray) |

**Production location:** `components/shared/priority-badge.tsx`

### LiveDuration

Currently inline in `agents-page.tsx`. Used by: Agents page (session list items, session header), Agent stream page.

Updates every second via `setInterval`. Displays `M:SS` format from a `startedAt` unix timestamp.

```typescript
interface LiveDurationProps {
  startedAt: number  // unix epoch seconds
  className?: string
}
```

**Production location:** `components/shared/live-duration.tsx`

### User Avatar Rendering Pattern

Currently duplicated across multiple components (EpicCard, UsersTab, CommentThread, SessionListItem). Consistent pattern:

- Colored circle with 2-letter initials
- `backgroundColor` from `user.color` (deterministic from user ID)
- `initials` computed from `user.name` (first letter of first + last name)
- Size varies: 24px (cards), 28px (header), 32px (detail views)

**Production location:** `components/shared/user-avatar.tsx`

```typescript
interface UserAvatarProps {
  user: { name: string; color: string; initials: string; avatarUrl?: string }
  size?: 'sm' | 'md' | 'lg'  // 24px | 28px | 32px
  className?: string
}
```

---

## TanStack Query Key Convention

See `01-shared-infrastructure.md` for the full TanStack Query key convention and query client configuration. All page specs reference query keys like `['epics', projectId]`, `['sessions', projectId]`, etc. -- the shared infrastructure spec defines the canonical key structure and invalidation patterns.

---

## Socket.IO Client Setup

See `01-shared-infrastructure.md` for the Socket.IO client singleton setup, authentication, room join/leave patterns, and reconnection strategy. Page specs reference socket events but the connection management is centralized.

---

## Responsive Design

Responsive breakpoints are not defined in the demo. Implementation agents should ensure minimum 1024px viewport. Mobile layout is out of scope for MVP.
