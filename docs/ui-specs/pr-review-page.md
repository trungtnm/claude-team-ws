# PR Review Page (`/review/:prNumber`)

## Overview

| Attribute | Value |
|-----------|-------|
| Route | `/review/:prNumber` |
| Page file | `ui/src/pages/pr-review-page.tsx` |
| Purpose | Code review interface: diff viewer, AI review summary, comment thread, merge actions |
| Key library | `react-diff-viewer-continued` v4.0 for split-view diffs |
| Data source (demo) | Static import from `ui/src/data/pr-review.ts` |
| Data source (prod) | `GET /api/reviews/:sessionId` for PR details + AI review + comments |
| Layout | Two-panel: left (file tree + diff), right (AI review + comments + Send to Agent) |

---

## Component Tree

```
PrReviewPage
├── Header bar
│   ├── Back button (-> /board)
│   ├── PR title + number
│   ├── Context line (Epic -> Agent, branch badge)
│   └── Action buttons
│       ├── Approve
│       ├── Request Changes
│       └── Merge dropdown (Squash / Merge commit / Rebase)
└── PrReviewLayout
    ├── Left panel (flex col, border-r)
    │   ├── FileTree (ScrollArea, max-h-48)
    │   ├── Separator
    │   ├── Selected file path mini-header
    │   └── DiffViewer (flex-1, overflow-auto)
    └── Right panel (380px fixed)
        ├── AiReviewSummary (Card, shrink-0)
        ├── Separator
        ├── CommentThread (ScrollArea, flex-1)
        ├── Separator
        └── "Send to Agent" button (shrink-0)
```

---

## Components

### PrReviewPage (`pages/pr-review-page.tsx`)

Top-level page. Renders header with actions and delegates body to `PrReviewLayout`.

#### Header

**Left side:**
- Back button: `<Link to="/board">` with ArrowLeft icon, ghost variant
- Vertical divider (`h-4 w-px bg-edge`)
- PR number and title: `#{prReview.prNumber} {prReview.title}`

**Right side -- Action buttons:**

| Button | Style | Handler |
|--------|-------|---------|
| Approve | Custom: `border-success/50 bg-success/10 text-success hover:bg-success/20` | `toast.success('PR approved')` |
| Request Changes | Custom: `border-warning/50 bg-warning/10 text-warning hover:bg-warning/20` | `toast.info('Changes requested')` |
| Merge (dropdown) | Primary with ChevronDown | Opens merge strategy dropdown |

**Merge dropdown options:**

| Option | Icon | Handler |
|--------|------|---------|
| Squash and merge | GitMerge | `toast.success('PR squash-merged successfully')` |
| Create merge commit | GitMerge | `toast.success('PR merged with merge commit')` |
| Rebase and merge | GitBranch | `toast.success('PR rebased and merged')` |

**Context line (below header):**

Indented with `ml-[72px]`. Displays:
- Epic name: `Epic: {prReview.epicTitle}`
- Arrow separator
- Agent name: `Agent: {prReview.agentName}`
- Branch badge (outline, mono): `{prReview.branch} -> {prReview.baseBranch}` with GitBranch icon

**Production API mapping:**
- Approve: `POST /api/reviews/:sessionId/comment` or separate approve endpoint
- Request Changes: Similar to approve with different status
- Merge: `POST /api/reviews/:sessionId/merge` with `{ strategy: 'squash' | 'merge' | 'rebase' }`

**Socket events on merge:**
- `pr:event` with `status: 'merged'` emitted to project room
- `notification` emitted to relevant users
- Server-side: `gh pr merge`, `br close`, epic status -> `done`, webhook notification, branch cleanup

---

### PrReviewLayout (`components/pr-review/pr-review-layout.tsx`)

Two-column grid layout: `grid-cols-[1fr_380px]`.

**Props:** `{ prReview: PrReview }`

**State:** `selectedFilePath` (string, defaults to first file)

**Left panel structure:**
1. `ScrollArea` (max-h-48, shrink-0): `FileTree` component
2. `Separator`
3. Selected file mini-header: path (mono, truncated) + `+{additions} -{deletions}` stats
4. Flex-1 overflow-auto: `DiffViewer` for selected file

**Right panel structure:**
1. `AiReviewSummary` (padding-4, shrink-0)
2. `Separator`
3. `ScrollArea` (flex-1): `CommentThread` with padding-4
4. `Separator`
5. "Send to Agent" button (outline, full-width, Send icon, padding-3)

**Send to Agent:** `toast.info('Feedback sent to agent for review')`. In production, this would trigger a new agent session or resume an existing one with the review feedback.

---

### FileTree (`components/pr-review/file-tree.tsx`)

Flat list of changed files with selection state.

**Props:**
```typescript
interface FileTreeProps {
  files: PrFile[]
  selectedFile: string        // currently selected file path
  onSelectFile: (path: string) => void
}
```

**Layout per file row:**
```
│  [FileCode icon]  src/pages/login-page.tsx     +87  -23  │
```

**Visual states:**
- Selected: `bg-surface-elevated border-l-2 border-accent`
- Unselected: `border-l-2 border-transparent hover:bg-surface-elevated`

**Elements per row:**
- FileCode icon (3.5x3.5, muted)
- File path (truncated, secondary text)
- Additions count (green, `text-success`)
- Deletions count (red, `text-error`)

**Header:** "Files Changed ({N})" as section title.

---

### DiffViewer (`components/pr-review/diff-viewer.tsx`)

Wraps `react-diff-viewer-continued` with custom dark theme matching the Warm Workshop palette.

**Props:**
```typescript
interface DiffViewerProps {
  file: PrFile    // contains oldCode and newCode strings
}
```

**ReactDiffViewer configuration:**

| Prop | Value |
|------|-------|
| `splitView` | `true` (side-by-side) |
| `useDarkTheme` | `true` |
| `styles` | Custom `diffStyles` object |

**Custom dark theme (`diffStyles.variables.dark`):**

| Variable | Value | Purpose |
|----------|-------|---------|
| `diffViewerBackground` | `#141210` | Main background (matches surface-base) |
| `diffViewerColor` | `#f5f0eb` | Text color (matches ink) |
| `addedBackground` | `rgba(34, 197, 94, 0.08)` | Green tint for added lines |
| `addedColor` | `#86efac` | Text color for added content |
| `removedBackground` | `rgba(239, 68, 68, 0.08)` | Red tint for removed lines |
| `removedColor` | `#fca5a5` | Text color for removed content |
| `wordAddedBackground` | `rgba(34, 197, 94, 0.2)` | Stronger green for word-level additions |
| `wordRemovedBackground` | `rgba(239, 68, 68, 0.2)` | Stronger red for word-level removals |
| `addedGutterBackground` | `rgba(34, 197, 94, 0.12)` | Gutter for added lines |
| `removedGutterBackground` | `rgba(239, 68, 68, 0.12)` | Gutter for removed lines |
| `gutterBackground` | `#1c1a17` | Default gutter bg |
| `gutterBackgroundDark` | `#141210` | Dark gutter bg |
| `highlightBackground` | `rgba(245, 158, 11, 0.1)` | Amber highlight for selected lines |
| `highlightGutterBackground` | `rgba(245, 158, 11, 0.15)` | Amber gutter highlight |
| `codeFoldGutterBackground` | `#1c1a17` | Code fold gutter |
| `codeFoldBackground` | `#221f1b` | Collapsed code fold area |
| `emptyLineBackground` | `#141210` | Empty/unchanged lines |
| `codeFoldContentColor` | `#78716c` | Fold indicator text |

**File header:** Renders file path in a `bg-surface-raised` header bar above the diff.

---

### AiReviewSummary (`components/pr-review/ai-review-summary.tsx`)

Card displaying automated review results across three categories.

**Props:**
```typescript
interface AiReviewSummaryProps {
  aiReview: {
    ubsPass: boolean
    ubsIssues: number
    securityWarnings: SecurityWarning[]
    standardsPass: boolean
    verdict: string
  }
}
```

**Sections:**

#### 1. UBS Check
- CheckCircle (green) if `ubsPass`, XCircle (red) if not
- Text: "UBS: Pass (0 issues)" or "UBS: Fail (N issues)"

#### 2. Security
- Shield icon with count: "Security ({N})"
- If warnings exist, renders each under `ml-6`:
  - Severity badge: mapped via `severityVariantMap`:
    - `high` -> `error` variant
    - `medium` -> `warning` variant
    - `low` -> `info` variant
  - Warning message
  - File path + line number (`{file}:{line}`)

#### 3. Standards
- CheckCircle (green) if `standardsPass`, XCircle (red) if not
- Text: "Standards: Pass" or "Standards: Fail"

#### 4. Verdict
- Separated by `border-t border-edge pt-3`
- Bold text: "Verdict: {verdict}"
- Color logic (`getVerdictColor`):
  - Contains "approved" or equals "approve": `text-success` (green)
  - Contains "request" or "change": `text-accent` (amber/accent)
  - Otherwise: `text-ink` (default)

---

### CommentThread (`components/pr-review/comment-thread.tsx`)

Comment list with add-comment form.

**Props:**
```typescript
interface CommentThreadProps {
  comments: PrComment[]
}
```

**Comment rendering:**

Each comment has:
- Author avatar:
  - AI authors (detected by `author.toLowerCase().includes('ai')`) get accent-colored Bot icon in circle
  - Human authors get initials in elevated-bg circle
- Author name (bold)
- Relative timestamp via `formatDistanceToNow(comment.createdAt * 1000, { addSuffix: true })`
- Comment text

**Visual distinction:**
- AI comments: `bg-surface-elevated/50`
- Human comments: `bg-surface-raised`

**Add comment form:**
- `<Textarea>` with placeholder "Add a comment..."
- `min-h-[60px]`
- "Comment" button (right-aligned, disabled when empty)
- Submit clears textarea, shows toast

**Production API mapping:**
- Add comment: `POST /api/reviews/:sessionId/comment` with `{ file, line, body }`
- Note: current demo does not support file/line-specific comments (only general thread)

---

## Data Model (`data/pr-review.ts`)

### PrFile

```typescript
interface PrFile {
  path: string
  additions: number
  deletions: number
  oldCode: string      // full old file content for diff
  newCode: string      // full new file content for diff
}
```

### SecurityWarning

```typescript
interface SecurityWarning {
  severity: 'high' | 'medium' | 'low'
  message: string
  file: string
  line: number
}
```

### PrComment

```typescript
interface PrComment {
  id: string
  author: string
  authorInitials: string
  text: string
  createdAt: number     // unix epoch
}
```

### PrReview

```typescript
interface PrReview {
  prNumber: number
  title: string
  branch: string
  baseBranch: string
  epicTitle: string
  agentName: string
  files: PrFile[]
  aiReview: {
    ubsPass: boolean
    ubsIssues: number
    securityWarnings: SecurityWarning[]
    standardsPass: boolean
    verdict: string
  }
  comments: PrComment[]
}
```

**Demo data:**
- PR #45: "feat: add login page redesign with GitHub SSO"
- Branch: `epic/login-redesign` -> `main`
- Epic: "Login Page Redesign", Agent: "SilverWolf"
- 3 files changed: `login-page.tsx` (+87/-23), `auth.ts` middleware (+12/-3), `auth.ts` routes (+18/-2)
- AI review: UBS pass, 2 security warnings (high: CSRF on OAuth, medium: redirect URI validation), standards pass, verdict "Changes Requested"
- 2 comments: 1 human (Trung Tran), 1 AI (AI Reviewer)

---

## Conditional Rendering States

| Condition | Behavior |
|-----------|----------|
| No files in PR | `selectedFile` is undefined, DiffViewer and mini-header not rendered |
| Selected file not found | Falls back to first file (`?? prReview.files[0]`) |
| `ubsPass === true` | Green CheckCircle icon |
| `ubsPass === false` | Red XCircle icon |
| No security warnings | "Security (0)" shown, no warning list rendered |
| Security warnings exist | Each warning rendered with severity badge under `ml-6` indent |
| `standardsPass === true` | Green CheckCircle icon |
| `standardsPass === false` | Red XCircle icon |
| Verdict contains "approved" | Green text |
| Verdict contains "request"/"change" | Accent colored text |
| AI author comment | Bot icon avatar, elevated/50 background |
| Human author comment | Initials avatar, raised background |
| Empty comment text | "Comment" button disabled |
| No comments | Empty list (no explicit empty state message) |

---

## Gaps vs Production API/Events

### Data Fetching Gaps

| Gap | Current (Demo) | Production Target |
|-----|---------------|-------------------|
| Data source | Static `prReview` import | TanStack Query: `useQuery(['review', sessionId], () => fetchReview(sessionId))` |
| Route params | `prNumber` in route but not used to fetch | Should fetch by session ID or PR number from route param |
| File diffs | Full `oldCode`/`newCode` strings in data | API returns `patch` field per file; may need to fetch full file contents separately |
| Comment submission | Toast only | `POST /api/reviews/:sessionId/comment` with `{ file, line, body }` |
| Approve action | Toast only | Needs approval endpoint or status update |
| Request Changes | Toast only | Needs endpoint to set review status |
| Merge action | Toast only | `POST /api/reviews/:sessionId/merge` with `{ strategy }` |
| Send to Agent | Toast only | Should trigger `POST /api/sessions/:sessionId/resume` or create new session with review context |

### Socket.IO Gaps

| Event | Expected Behavior |
|-------|-------------------|
| `pr:event` (`status: 'review_complete'`) | Refresh AI review data |
| `pr:event` (`status: 'merged'`) | Show merged state, disable action buttons |
| `pr:event` (`status: 'changes_requested'`) | Update verdict display |
| `session:event` | If "Send to Agent" triggers a session, show agent progress |
| Not connected | Demo has no socket integration |

### API Response Shape Mapping

The demo UI and the production API use different data shapes for AI review results. The implementation agent must transform the API response to match the component props.

**Demo UI shape (used by `AiReviewSummary` component):**
```typescript
{
  ubsPass: boolean
  ubsIssues: number
  securityWarnings: SecurityWarning[]
  standardsPass: boolean
  verdict: string
}
```

**Production API response shape (`GET /api/reviews/:sessionId`):**
```typescript
{
  checks: {
    ubs: "pass" | "fail"
    security: "0 warnings" | "1 warning" | "N warnings"
    // other check keys possible
  },
  comments: PrComment[]
  // ... other fields
}
```

**Required transformation:**
```typescript
// Transform API response to component props
const aiReview = {
  ubsPass: apiResponse.checks.ubs === "pass",
  ubsIssues: /* parse from ubs detail or separate field */,
  securityWarnings: /* parse from comments with security type, or separate endpoint */,
  standardsPass: /* derive from checks or separate field */,
  verdict: /* derive from overall check status */
}
```

> **Note:** The exact transformation depends on the final API response contract. The `securityWarnings` array (with `severity`, `message`, `file`, `line` per item) is not directly available from the `checks` summary string. The implementation agent should coordinate with the backend to either: (a) include structured security warnings in the response, or (b) parse them from review comments that have a `security` category.

### Route Parameter Mismatch

> **WARNING NEEDS DECISION:** The demo route uses `/review/:prNumber` but the production API endpoints use `:sessionId` (e.g., `GET /api/reviews/:sessionId`, `POST /api/reviews/:sessionId/merge`). The PR number and session ID are different identifiers.
>
> **Proposed resolution options:**
>
> **(a)** Change the route to `/review/:sessionId` and pass the session ID directly. This aligns with the API but breaks bookmarkable URLs by PR number.
>
> **(b)** Keep `/review/:prNumber` and add a lookup step: first call `GET /api/projects/:projectId/sessions?pr_number=:prNumber` to resolve the session ID, then use that for all subsequent API calls.
>
> **(c)** Add a backend endpoint `GET /api/reviews/by-pr/:prNumber` that accepts PR number and resolves internally.
>
> Option (a) is simplest. Option (b) preserves user-friendly URLs. The implementation agent should decide and document the choice.

### Missing Features

| Feature | Details |
|---------|---------|
| Inline diff comments | API supports file+line comments but UI only has general thread |
| File-specific comment markers | No gutter annotations showing where comments exist |
| Comment reply threading | Comments are flat list, no nesting/replies |
| Resolve/unresolve comments | No mechanism to mark comments as resolved |
| Diff view mode toggle | No option to switch between split and unified view |
| Syntax highlighting in diff | `react-diff-viewer-continued` supports it via `renderContent` but not configured |
| File search/filter in tree | No search within file list |
| Expand/collapse file tree | File tree always visible, no toggle |
| Loading state | No skeleton or spinner while loading PR data |
| Error state | No error boundary for failed fetch |
| PR status badge in header | No visual indicator of current PR status (open/approved/merged) |
| Commit list | No list of commits in the PR |
| CI/CD status | No display of CI check results |
| Review request assignment | No way to request review from specific team members |
| Code suggestions | AI comments don't have "apply suggestion" functionality |
| Copy line reference | No way to copy a link to a specific line in the diff |
| Keyboard navigation | No keyboard shortcuts for file navigation or actions |
| Agent session link | No link to view the agent session that produced the PR |
| Diff stats summary | No total additions/deletions summary in header |

---

## Integration Checklist

### Data Layer
- [ ] Replace static import with TanStack Query: `useQuery(['review', sessionId], fetchReview)`
- [ ] Extract `sessionId` or `prNumber` from route params via `useParams()`
- [ ] Handle loading state with skeleton UI
- [ ] Handle error state with error boundary or fallback UI
- [ ] Handle "PR not found" state (404)

### Actions
- [ ] Wire Approve button to approval API endpoint
- [ ] Wire Request Changes to review status API
- [ ] Wire Merge dropdown to `POST /api/reviews/:sessionId/merge`
- [ ] Wire comment submission to `POST /api/reviews/:sessionId/comment`
- [ ] Wire "Send to Agent" to `POST /api/sessions/:sessionId/resume` with review feedback
- [ ] Add confirmation dialog before merge actions
- [ ] Disable action buttons based on user role (`requireRole` per CLAUDE.md permissions table)

### Real-time
- [ ] Subscribe to `pr:event` socket events for this PR
- [ ] Invalidate review query on `pr:event` status changes
- [ ] Show real-time comment additions from other reviewers
- [ ] Show merge status change in real time

### Enhanced Features
- [ ] Add inline diff comments (click on line gutter to comment)
- [ ] Add gutter markers for existing comments on specific lines
- [ ] Add split/unified view toggle for DiffViewer
- [ ] Configure syntax highlighting via `renderContent` prop
- [ ] Add PR status badge in header (open/approved/changes_requested/merged)
- [ ] Add commit list view
- [ ] Add total diff stats in header
- [ ] Add file search/filter in FileTree
- [ ] Add keyboard shortcuts (n/p for next/prev file, a for approve)
- [ ] Add link to agent session that produced this PR
