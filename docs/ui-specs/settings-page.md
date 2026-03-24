# Settings Page (`/settings`)

## Overview

| Attribute | Value |
|-----------|-------|
| Route | `/settings` |
| Page file | `ui/src/pages/settings-page.tsx` |
| Purpose | Project configuration: identity, repos, users, knowledge rules, webhooks |
| Layout | 5-tab interface using shadcn `Tabs` |
| Data source (demo) | Static imports from `data/repos.ts`, `data/users.ts`, `data/rules.ts`, `data/webhooks.ts` |
| Data source (prod) | Multiple API endpoints (see per-tab sections) |

---

## Component Tree

```
SettingsPage
├── Tabs (defaultValue="project")
│   ├── TabsList
│   │   ├── TabsTrigger "Project" (Settings2 icon)
│   │   ├── TabsTrigger "Repositories" (GitBranch icon)
│   │   ├── TabsTrigger "Users" (Users icon)
│   │   ├── TabsTrigger "Rules" (BookOpen icon)
│   │   └── TabsTrigger "Webhooks" (Webhook icon)
│   └── TabsContent (overflow-y-auto)
│       ├── ProjectTab
│       ├── ReposTab
│       │   ├── RepoCard[] (per repo)
│       │   └── AddRepoDialog
│       ├── UsersTab
│       │   ├── UserRow[] (per user)
│       │   └── InviteUserDialog
│       ├── RulesTab
│       │   ├── RuleCard[] (per rule)
│       │   └── RuleDialog (add/edit modes)
│       └── WebhooksTab
│           ├── WebhookCard[] (per webhook)
│           └── AddWebhookDialog
```

---

## Tab 1: Project (`ProjectTab`)

**File:** `components/settings/project-tab.tsx`

**Layout:** `max-w-2xl`, vertically stacked sections separated by `<Separator />`.

### Section: Project Identity

| Field | Type | Default Value | API Mapping |
|-------|------|--------------|-------------|
| Project picture | Avatar with camera overlay | Initials "CT" on accent bg | Not in current API |
| Project name | `<Input>` | `'claude-team-ws'` | `PATCH /api/projects/:projectId` `{ name }` |
| Description | `<Textarea>` (2 rows) | Full project description | Not in current API schema (new field needed) |
| Project ID | Read-only `<code>` + copy button | `'proj-1'` | `projects.id` |
| Slug | Read-only `<code>` | `'claude-team-ws'` | `projects.slug` |

**Picture interactions:**
- Hover overlay shows Camera icon
- "Upload" button triggers `toast.info('Upload project picture')`
- "Remove" button triggers `toast('Picture removed')`

**Copy ID interaction:** Copies `'proj-1'` to clipboard, shows Check icon for 1.5s.

### Section: Workspace

| Field | Type | Default Value | API Mapping |
|-------|------|--------------|-------------|
| Project root path | `<Input>` (mono, xs) | `/Users/trungtran/code/claude-team-ws` | `projects.project_root` |

### Section: Agent Configuration

| Field | Type | Default Value | API Mapping |
|-------|------|--------------|-------------|
| Max concurrent agents | `<Input type="number">` (min 1, max 10, w-20) | `'3'` | `PATCH /api/projects/:projectId` `{ max_concurrent_agents }` |
| AskUserQuestion mode | Custom radio group (3 options) | `'hybrid'` | `PATCH /api/projects/:projectId` `{ ask_question_mode }` |

**AskUserQuestion mode options:**

| Value | Label | Description |
|-------|-------|-------------|
| `pause` | Pause | Agent stops and waits for human answer |
| `auto` | Auto-decide | Agent picks the best option itself |
| `hybrid` | Hybrid | Auto-decide for low-risk, pause for high-risk |

Visual: Custom radio-button-like cards. Selected card gets `border-accent/40 bg-accent-muted` with filled dot. Unselected gets `border-edge hover:bg-surface-elevated`.

### Section: Integrations

| Integration | Detail | Status (demo) |
|------------|--------|---------------|
| Agent Mail | port 8765 | `connected` (green) |
| Context Manager (CM) | port 9900 | `connected` (green) |
| CASS | CLI tool | `not-found` (yellow) |

**Status display mapping:**

| Status | Dot Color | Label | Label Color |
|--------|-----------|-------|-------------|
| `connected` | `bg-green-400` | "Connected" | `text-green-400` |
| `disconnected` | `bg-red-400` | "Disconnected" | `text-red-400` |
| `not-found` | `bg-yellow-400` | "Not found" | `text-yellow-400` |

"Refresh status" button (ghost, with RefreshCw icon) re-renders the list with a toast.

### Section: Data

- "Export project data" button with Download icon
- Exports all project data as JSON (captures, epics, sessions, rules)
- Currently triggers `toast.success`

### Section: Danger Zone

Red-bordered section (`border-error/20`) with two actions:

| Action | Button | Description |
|--------|--------|-------------|
| Transfer ownership | `Transfer` (outline, error styled, ArrowRightLeft icon) | Transfers project to another member |
| Delete project | `Delete` (outline, error styled, Trash2 icon) | Permanently removes project |

Both actions currently trigger toasts only.

### Save Button

Bottom of page: "Save Changes" button (primary, Save icon) + Badge showing "Last saved 2 hours ago".

**All state is local `useState`** -- no API calls in demo.

---

## Tab 2: Repositories (`ReposTab`)

**File:** `components/settings/repos-tab.tsx`

**Production API endpoints:**
- `GET /api/projects/:projectId/repos` -- list repos
- `POST /api/projects/:projectId/repos` -- add repo (clone or link)
- `DELETE /api/projects/:projectId/repos/:repoName` -- remove repo
- `POST /api/projects/:projectId/repos/:repoName/pull` -- pull latest

### Header

- Left: "{N} repositories configured"
- Right: "Pull All" button (outline, RefreshCw) + "Add Repo" button (primary, Plus)

### RepoCard

One card per repo. Shows repo metadata + actions.

**Card layout:**
```
┌──────────────────────────────────────────────────────┐
│  [icon] backend    Ready    Synced         [...]     │
│         git@github.com:team/backend.git              │
│  ⑤ main    Cloned                                   │
│  a3f8c21  feat: add rate limit middleware  BlueLake  │
└──────────────────────────────────────────────────────┘
```

**Displayed fields:**

| Field | Source | Display |
|-------|--------|---------|
| Name | `repo.name` | Bold text |
| Status badge | `repo.status` | "Ready" (success) / "Cloning" (warning) / "Error" (error) |
| Sync status | `syncStatusMap[repo.id]` (simulated) | "Synced" (green) / "Behind by N commits" (amber) / "Diverged" (red) |
| URL/path | `repo.gitUrl \|\| repo.path` | Mono, truncated |
| Default branch | `repo.defaultBranch` | With GitBranch icon |
| Link mode | `repo.linkMode` | "Cloned" or "Linked" |
| Uncommitted count | `repo.uncommittedCount` | Badge (warning) if > 0 |
| Last commit SHA | `repo.lastCommit.sha` | First 7 chars, mono |
| Last commit message | `repo.lastCommit.message` | Truncated |
| Last commit author | `repo.lastCommit.author` | Plain text |
| Last commit time | `repo.lastCommit.time` | `formatDistanceToNow` with suffix |

**Dropdown menu actions (MoreVertical):**

| Action | Icon | Handler |
|--------|------|---------|
| Pull latest | ArrowDownToLine | Toast "Pulling latest for {name}..." |
| View branches | GitFork | Toast "Viewing branches for {name}" |
| Switch branch | GitBranch | Toast "Branch switcher coming soon" |
| Copy path | Copy | Copies `repo.path` to clipboard |
| Open in terminal | Terminal | Toast "Opening terminal at {path}" |
| --- separator --- | | |
| Remove | Trash2 (error styled) | Toast "Removed repository {name}" |

### AddRepoDialog (`components/settings/add-repo-dialog.tsx`)

Modal dialog with two modes, toggled via a segmented control.

**Mode toggle:** "Clone from URL" / "Link existing" (styled like tabs, not shadcn Tabs)

**Fields by mode:**

| Field | Clone Mode | Link Mode | API Mapping |
|-------|-----------|-----------|-------------|
| Name | Required input | Required input | `name` |
| Git URL | Required input (`git@github.com:org/repo.git`) | Hidden | `git_url` |
| Path | Hidden | Required input with Folder icon prefix | `source_path` |
| Branch | Input (default "main") | Input (default "main") | `default_branch` |

**Validation (client-side):**
- Name is always required
- Git URL required in clone mode
- Path required in link mode

**API mapping:**
- Clone mode: `POST /api/projects/:projectId/repos` with `{ mode: 'clone', name, git_url, default_branch }`
- Link mode: `POST /api/projects/:projectId/repos` with `{ mode: 'link', name, source_path, default_branch }`

**Socket event:** Server emits `repo:added` to project room after successful add.

### Repo Data Model (`data/repos.ts`)

```typescript
interface Repo {
  id: string
  name: string
  gitUrl: string
  path: string
  defaultBranch: string
  linkMode: 'clone' | 'symlink'
  status: 'ready' | 'cloning' | 'error'
  lastCommit: { sha: string; message: string; author: string; time: number }
  uncommittedCount: number
}
```

Demo: 6 repos (backend, frontend, mobile, shared-types, docs, infra). Mobile is a symlink with 2 uncommitted changes.

---

## Tab 3: Users (`UsersTab`)

**File:** `components/settings/users-tab.tsx`

**Production API endpoints:**
- Implied by DB schema: users table, project_members table
- No explicit user management endpoints in current API spec (gap)

### Header

- Left: Role summary string (e.g., "5 members . 1 PM . 2 Developer . 1 Tech Lead . 1 Viewer")
- Right: "Invite User" button (primary, Plus)

### UserRow

Renders each user in a divided card list.

**Display elements:**

| Element | Details |
|---------|---------|
| Avatar | Colored circle with initials, `backgroundColor` from `user.color` |
| Name | Bold text + "(you)" accent label if current user |
| Pending badge | Yellow outline badge if user is in `pendingUsers` set |
| Email | Muted text below name |
| Last active | Clock icon + simulated timestamp |
| Role badge | Colored badge (`roleColors[role]`) |
| Permission hint | Tiny text under badge (e.g., "Can triage, merge") |

**Role permission hints:**

| Role | Hint |
|------|------|
| `pm` | "Can triage, merge" |
| `dev` | "Can code, review" |
| `techlead` | "Full access" |
| `viewer` | "Read-only" |

**Pending user actions:**
- "Resend" button (outline, Mail icon) visible only for pending users

**Dropdown menu actions (MoreVertical):**

| Action | Details |
|--------|---------|
| Change Role (label) | Shows all 4 roles; current role highlighted with accent + "current" label |
| Copy invite link | Copies `https://ctw.dev/invite/{userId}` |
| --- separator --- | |
| Remove | Error styled, disabled if current user |

**Role change:** Local state update via `setCurrentRole`, toast notification.

### InviteUserDialog

Modal dialog for inviting new team members.

| Field | Type | Validation |
|-------|------|-----------|
| Name | `<Input>` | Required (toast error if empty) |
| Email | `<Input type="email">` | Required (toast error if empty) |
| Role | `<Select>` (4 options with permission hints) | Default: `'dev'` |

Each role option shows the role label + permission hint in the dropdown.

Buttons: Cancel (outline) + Send Invite (primary, Mail icon).

### User Data Model (`data/users.ts`)

```typescript
interface User {
  id: string
  name: string
  email: string
  role: 'pm' | 'dev' | 'techlead' | 'viewer'
  avatarUrl?: string
  initials: string
  color: string
}
```

Demo: 5 users. `currentUser` is `users[0]` (Trung Tran, techlead). User `u-5` (Lan Vo) is pending.

---

## Tab 4: Rules (`RulesTab`)

**File:** `components/settings/rules-tab.tsx`

**Production API endpoints:**
- `GET /api/projects/:projectId/rules` -- list rules (query: `category`, `maturity`, `min_confidence`)
- `POST /api/projects/:projectId/rules` -- add rule (TechLead only)
- `PATCH /api/projects/:projectId/rules/:ruleId` -- update rule
- `DELETE /api/projects/:projectId/rules/:ruleId` -- delete rule

### Header

- Left: "{N} knowledge rules"
- Right: "Add Rule" button (primary, Plus)

### Guidelines Box

Informational box explaining the rule system:
- Two sources: Manual (cyan) and Auto (orange)
- Maturity lifecycle: Candidate (yellow) -> Established (blue) -> Proven (green)
- Confidence decays over 90 days if not reinforced

### Filter Bar

| Filter | Type | Options |
|--------|------|---------|
| Search | `<Input>` with Search icon prefix | Full-text search on `ruleText` and `id` |
| Category | `<Select>` (w-140px) | "All categories", coding, security, testing, architecture, general |
| Maturity | `<Select>` (w-140px) | "All maturity", candidate, established, proven, deprecated |

Below filters: "Showing {N} of {M} rules" + conditional "Approve all candidates ({N})" button.

### RuleCard

One card per rule.

**Card layout:**
```
┌───────────────────────────────────────────────────────┐
│  Always use execFile instead of exec for CLI...       │
│                                                       │
│  [security] [proven] [manual]                         │
│                                                       │
│  Confidence               95%                         │
│  ████████████████████████████░░                        │
│                                                       │
│  👍 12    👎 0         [Edit] [Test] [Deprecate]      │
└───────────────────────────────────────────────────────┘
```

**Badge colors:**

Category colors (`categoryColors`):

| Category | Style |
|----------|-------|
| coding | `text-blue-400 bg-blue-400/10` |
| security | `text-red-400 bg-red-400/10` |
| testing | `text-green-400 bg-green-400/10` |
| architecture | `text-purple-400 bg-purple-400/10` |
| general | `text-gray-400 bg-gray-400/10` |

Maturity colors (`maturityColors`):

| Maturity | Style |
|----------|-------|
| candidate | `text-yellow-400 bg-yellow-400/10` |
| established | `text-blue-400 bg-blue-400/10` |
| proven | `text-green-400 bg-green-400/10` |
| deprecated | `text-red-400 bg-red-400/10` |

Source colors:

| Source | Style |
|--------|-------|
| manual | `text-cyan-400 bg-cyan-400/10` |
| auto | `text-orange-400 bg-orange-400/10` |

**Confidence bar:**
- Visual progress bar, color changes based on value:
  - `> 0.8`: `bg-green-400`
  - `> 0.6`: `bg-yellow-400`
  - `<= 0.6`: `bg-red-400`

**Stats:** ThumbsUp count (green) + ThumbsDown count (red)

**Actions per card:**

| Action | Condition | Handler |
|--------|-----------|---------|
| Edit (Pencil) | Always visible | Opens `RuleDialog` in edit mode |
| Test (FlaskConical) | Always visible | Toast "Running rule against codebase..." |
| Approve | Only when `maturity === 'candidate'` | Sets maturity to `'established'`, toast |
| Deprecate | When `maturity !== 'deprecated'` | Sets maturity to `'deprecated'`, toast |

**Bulk action:** "Approve all candidates ({N})" button promotes all candidate rules to established.

### RuleDialog (Add/Edit)

Shared dialog component for both add and edit operations.

| Field | Type | Details |
|-------|------|---------|
| Rule text | `<Textarea>` (3 rows) | Required. Placeholder with example. Helper: "Write as a clear imperative." |
| Category | `<Select>` | 5 options (coding, security, testing, architecture, general) |
| Source | `<Input>` (disabled) | Shows "Manual" or "Auto" (read-only) |

**AI Improve feature:**

"Improve with AI" button (ghost, Sparkles icon, accent color) in the rule text header:

1. Click triggers `handleImproveWithAI()`
2. Shows Loader2 spinner with "Improving..." text
3. After 1.5s simulated delay, shows AI suggestion panel:
   - Bordered accent box with Sparkles icon + "AI suggestion" label
   - Improved rule text
   - Explanation of changes
   - Optional category suggestion if different from current
   - "Accept" button (applies suggestion to form) + "Dismiss" button

**AI state machine:** `'idle' | 'improving' | 'done'`

- Editing the rule text after AI suggestion resets state to `'idle'`
- Accepting applies `aiSuggestion.improved` to `ruleText` and `aiSuggestion.category` to `category`

**Demo AI suggestion (hardcoded):**
- Improved text: "Always use `execFile` instead of `exec` for CLI wrappers to prevent shell injection vulnerabilities. Pass arguments as an array, never concatenate into a command string."
- Category: `security`
- Explanation: "Made the rule more specific: added the 'why' (shell injection), and the actionable detail (pass arguments as array). Clearer imperative tone."

### Rule Data Model (`data/rules.ts`)

```typescript
interface KnowledgeRule {
  id: string
  ruleText: string
  category: 'coding' | 'security' | 'testing' | 'architecture' | 'general'
  confidence: number         // 0.0 - 1.0
  maturity: 'candidate' | 'established' | 'proven' | 'deprecated'
  source: 'manual' | 'auto'
  helpfulCount: number
  harmfulCount: number
  createdAt: number          // unix epoch
}
```

Demo: 6 rules covering security, coding, architecture, testing patterns.

---

## Tab 5: Webhooks (`WebhooksTab`)

**File:** `components/settings/webhooks-tab.tsx`

**Production API endpoints:**
- `GET /api/projects/:projectId/webhooks` -- list webhooks
- `POST /api/projects/:projectId/webhooks` -- add webhook (PM or TechLead)

**DB table:** `webhook_configs` (id, project_id, type, url, events, enabled, created_at)

### Header

- Left: "{N} webhooks configured"
- Right: "Add Webhook" button (primary, Plus)

### WebhookCard

One card per webhook with inline editing capabilities.

**Card layout:**
```
┌────────────────────────────────────────────────────────────┐
│  [icon] Slack   Active   ● Healthy   [Send Test] [Dis] [.]│
│         https://hooks.slack.com/ser...                     │
│         Last triggered 2 hours ago                         │
│                                                            │
│  Events                                                    │
│  [x] Agent Session Complete  [x] PR Ready  [x] PR Merged  │
└────────────────────────────────────────────────────────────┘
```

**Type configuration:**

| Type | Icon | Label | URL Placeholder |
|------|------|-------|-----------------|
| `slack` | Hash | Slack | `https://hooks.slack.com/services/T0xxx/B0xxx/xxxx` |
| `discord` | MessageCircle | Discord | `https://discord.com/api/webhooks/...` |
| `telegram` | Bot | Telegram | `https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>` |

**Displayed fields:**

| Field | Source |
|-------|--------|
| Type icon + label | `typeConfig[webhook.type]` |
| Enabled badge | "Active" (success) or "Disabled" (default) |
| Health indicator | Green dot "Healthy" or red dot "{N} failures in last 24h" |
| URL (masked) | First 30 chars + "..." |
| Last triggered | Simulated metadata |

**Card actions:**

| Action | Details |
|--------|---------|
| Send Test | Outline button, Send icon. Toast "Test notification sent to {type}" |
| Enable/Disable | Toggle button. Changes badge + button label |
| Edit URL (dropdown) | Switches URL display to inline `<Input>`. Enter to save, Escape to cancel. |
| Delete (dropdown) | Shows inline confirmation box with "Are you sure?" + Cancel/Delete buttons |
| Event toggles | Checkbox-style toggle buttons for each event. Inline update with toast. |

**Inline URL editing:**
- `editingUrl` state replaces the masked URL with an editable `<Input>`
- `Enter` key saves, `Escape` key cancels
- `onBlur` cancels the edit

**Delete confirmation:**
- Inline red-bordered box replaces dropdown
- "Are you sure? This cannot be undone."
- Cancel + Delete (error styled) buttons

### AddWebhookDialog

Modal dialog for adding new webhooks.

**Type selector:** Segmented control (Slack / Discord / Telegram) with icons. Switching type resets setup guide state.

**Setup guide (collapsible):**

Per-type setup instructions displayed in a collapsible section:

| Type | Steps | Docs URL |
|------|-------|----------|
| Slack | 5 steps (workspace settings -> enable hooks -> add webhook -> copy URL) | `https://api.slack.com/messaging/webhooks` |
| Discord | 4 steps (server settings -> integrations -> new webhook -> copy URL) | `https://support.discord.com/hc/en-us/articles/228383668` |
| Telegram | 6 steps (BotFather -> create bot -> get token -> add to group -> get chat ID -> construct URL) | `https://core.telegram.org/bots/api` |

Each step has a numbered circle. Steps with `code` property show a copyable code block with Copy/Check button.

**URL input:**
- Label changes: "Bot API URL" for Telegram, "Webhook URL" for others
- Placeholder varies by type
- Telegram shows format hint below input

**Event selection:**
- Toggle buttons for each available event
- All events pre-selected by default
- Visual: selected = accent border + accent bg + checkmark; unselected = edge border + elevated bg

**Available events (`data/webhooks.ts`):**

| Value | Label |
|-------|-------|
| `session_complete` | Agent Session Complete |
| `pr_ready` | PR Ready for Review |
| `pr_merged` | PR Merged |
| `question_waiting` | Agent Needs Input |
| `session_failed` | Agent Session Failed |

**Validation:**
- URL is required (toast error)
- At least one event must be selected (toast error)

**On submit:** Creates `WebhookConfig` object with generated ID, adds to local state, resets form, closes dialog.

### Webhook Data Model (`data/webhooks.ts`)

```typescript
interface WebhookConfig {
  id: string
  type: 'slack' | 'discord' | 'telegram'
  url: string
  events: string[]
  enabled: boolean
  createdAt: number
}
```

Demo: 3 webhooks (Slack active, Discord disabled, Telegram active).

### WARNING: Telegram Type Not in DB Schema

> **WARNING NEEDS DECISION:** The demo UI includes `telegram` as a webhook type, but the DB schema for `webhook_configs.type` only allows `'slack' | 'discord'`. The implementation agent must choose one of:
>
> **(a)** Add `telegram` to the DB schema via a Drizzle migration (update the `type` column constraint to `'slack' | 'discord' | 'telegram'`), OR
>
> **(b)** Remove `telegram` from the UI entirely (remove from `typeConfig`, `AddWebhookDialog` type selector, and setup guides).
>
> This must be resolved before implementing the Webhooks tab. If choosing (a), coordinate with the backend agent to ensure the migration is applied.

---

## Conditional Rendering States

| Condition | Tab | Behavior |
|-----------|-----|----------|
| No repos | Repos | List is empty (no explicit empty-state UI) |
| No rules matching filters | Rules | Centered "No rules match the current filters." message |
| No webhooks | Webhooks | Centered "No webhooks configured. Add one to get started." message |
| No candidate rules | Rules | "Approve all candidates" button hidden |
| Current user in user list | Users | "(you)" label shown, Remove action disabled |
| Pending user | Users | "Pending" badge + "Resend" button visible |
| Webhook unhealthy | Webhooks | Red dot + failure count instead of green "Healthy" |
| CASS not found | Project | Yellow "Not found . Not installed" status |
| Clone mode selected | Add Repo | Git URL field shown, Path field hidden |
| Link mode selected | Add Repo | Path field shown, Git URL field hidden |
| Telegram type selected | Add Webhook | URL label changes to "Bot API URL", format hint shown |
| AI suggestion available | Rules (dialog) | Suggestion panel animates in below textarea |
| AI improving | Rules (dialog) | Loader2 spinner, button text "Improving..." |

---

## Gaps vs Production API/Events

### Data Fetching Gaps

| Gap | Current (Demo) | Production Target |
|-----|---------------|-------------------|
| All state is local | `useState` with static imports | TanStack Query per tab: `['repos', projectId]`, `['users', projectId]`, `['rules', projectId]`, `['webhooks', projectId]` |
| Project settings load | Hardcoded values | `GET /api/projects/:projectId` populates form |
| Save action | Toast only | `PATCH /api/projects/:projectId` with dirty field detection |
| Add repo | Toast only | `POST /api/projects/:projectId/repos` |
| Remove repo | Toast only | `DELETE /api/projects/:projectId/repos/:repoName` with confirmation body `{ confirm: true }` |
| Pull repo | Toast only | `POST /api/projects/:projectId/repos/:repoName/pull` |
| User CRUD | Toast only | No explicit API endpoints in spec (gap in API spec) |
| Rule CRUD | Local state mutation | `POST`, `PATCH`, `DELETE` on `/api/projects/:projectId/rules` |
| Webhook CRUD | Local state mutation | `POST /api/projects/:projectId/webhooks` (delete/update endpoints not in spec) |
| AI improve rule | Hardcoded response after 1.5s | Should call CM service or Claude API |
| Integration health check | Static data | Should poll Docker container health / CLI tool availability |

### Socket.IO Gaps

| Event | Tab Affected | Expected Behavior |
|-------|-------------|-------------------|
| `repo:added` | Repos | Invalidate `['repos', projectId]` query |
| `repo:removed` | Repos | Invalidate `['repos', projectId]` query |
| `repo:clone_progress` | Repos | Update cloning repo status in real time |
| `beads:changed` | Rules | Refetch rules if CM integration |
| Not specified | Webhooks | Webhook delivery status updates |

### Missing Features

| Feature | Details |
|---------|---------|
| Project description field | Not in `projects` DB schema; needs migration |
| Project picture upload | No file upload endpoint in API |
| User management API | No `GET/POST/DELETE /api/projects/:projectId/members` endpoints |
| Role change API | No endpoint to change user roles |
| Webhook update/delete API | Only `GET` and `POST` endpoints exist for webhooks |
| Webhook delivery logs | No endpoint to view webhook delivery history |
| Rule test execution | "Test" button has no backend implementation |
| Integration health endpoint | No `GET /api/health/integrations` or similar |
| Form dirty detection | No unsaved changes warning on tab switch or navigation |
| Optimistic updates | All mutations are fire-and-forget toasts |
| Error handling | No error states for failed API calls |
| Loading states | No loading skeletons during data fetch |
| Repo clone progress | `repo:clone_progress` socket event defined but no progress UI |
| Branch management | "View branches" and "Switch branch" are placeholders |
| User avatar upload | `avatarUrl` field exists on User type but no upload flow |
| Data export implementation | Export button triggers toast only |
| Transfer ownership flow | No confirmation dialog or API endpoint |
| Delete project flow | No double-confirmation or API endpoint |

---

## Integration Checklist

### Project Tab
- [ ] Fetch project data on mount: `useQuery(['project', projectId], fetchProject)`
- [ ] Wire save button to `PATCH /api/projects/:projectId`
- [ ] Add form dirty detection and unsaved changes warning
- [ ] Implement integration health check polling
- [ ] Add project description to DB schema (migration)
- [ ] Implement file upload for project picture
- [ ] Wire export button to server-side data export endpoint
- [ ] Add transfer ownership confirmation dialog + API
- [ ] Add delete project double-confirmation dialog + API

### Repos Tab
- [ ] Fetch repos: `useQuery(['repos', projectId], fetchRepos)`
- [ ] Wire "Add Repo" to `POST /api/projects/:projectId/repos`
- [ ] Wire "Remove" to `DELETE /api/projects/:projectId/repos/:repoName`
- [ ] Wire "Pull latest" to `POST /api/projects/:projectId/repos/:repoName/pull`
- [ ] Listen for `repo:added`, `repo:removed`, `repo:clone_progress` socket events
- [ ] Show clone progress bar during `repo:clone_progress`
- [ ] Wire "View branches" to `GET /api/projects/:projectId/repos/:repoName/branches`
- [ ] Add optimistic updates for pull/remove operations

### Users Tab
- [ ] Design and implement user management API endpoints
- [ ] Fetch users: `useQuery(['users', projectId], fetchProjectMembers)`
- [ ] Wire "Invite User" to POST endpoint
- [ ] Wire role change to PATCH endpoint
- [ ] Wire "Remove" to DELETE endpoint
- [ ] Add real last-active tracking

### Rules Tab
- [ ] Fetch rules: `useQuery(['rules', projectId], fetchRules)`
- [ ] Wire "Add Rule" to `POST /api/projects/:projectId/rules`
- [ ] Wire "Edit" to `PATCH /api/projects/:projectId/rules/:ruleId`
- [ ] Wire "Approve" to `PATCH` with `{ maturity: 'established' }`
- [ ] Wire "Deprecate" to `PATCH` with `{ maturity: 'deprecated' }`
- [ ] Wire "AI Improve" to CM service or Claude API call
- [ ] Wire "Test" to run rule against codebase via server endpoint
- [ ] Add `requireRole('techlead')` guard on write operations

### Webhooks Tab
- [ ] Fetch webhooks: `useQuery(['webhooks', projectId], fetchWebhooks)`
- [ ] Wire "Add Webhook" to `POST /api/projects/:projectId/webhooks`
- [ ] Design and implement webhook update/delete API endpoints
- [ ] Wire enable/disable toggle to PATCH endpoint
- [ ] Wire URL edit to PATCH endpoint
- [ ] Wire delete to DELETE endpoint with confirmation
- [ ] Wire "Send Test" to test delivery endpoint
- [ ] Add webhook delivery log viewing
