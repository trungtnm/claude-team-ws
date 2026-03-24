# Umbrella Repo Workflow — claude-team-ws

## Overview

Each project in the workspace is backed by an **umbrella repo** — a lightweight git repo that only tracks project metadata (Beads state, CM rules, project config), not source code. Source code lives in separate **code repos** inside the `repos/` directory.

```
myproject/                  ← Umbrella repo (.git here)
├── .beads/issues.jsonl     ← Tracked: issue state for the whole team
├── .cass/playbook.yaml     ← Tracked: team rules
├── repos/
│   ├── backend/            ← Separate code repo (its own .git)
│   └── frontend/           ← Separate code repo (its own .git)
└── .ccu/                   ← Gitignored: ephemeral session state
```

**2 completely independent git layers:**

| | Umbrella repo | Code repos |
|---|---|---|
| **Path** | `myproject/` | `myproject/repos/backend/`, `myproject/repos/frontend/` |
| **Tracks** | `.beads/issues.jsonl`, `.cass/`, config | Source code, tests, configs |
| **Commit frequency** | A few times/day (when beads state changes) | Continuously (agent commits, dev commits) |
| **Who pushes** | Workspace app (auto) | Agents (auto), devs (manual) |
| **Remote** | Separate private repo (e.g., `team/myproject-meta`) | Team's main repos (e.g., `team/backend`) |
| **Branch strategy** | Only `main` (no branches) | `main` + `epic/<slug>` branches |

---

## Project Lifecycle

### 1. Create Project

PM clicks **"New Project"** in the workspace UI.

```
POST /api/projects { "name": "MyApp", "slug": "myapp" }
```

**Server performs:**

```bash
# 1. Create project directory
mkdir -p /data/projects/myapp/repos

# 2. Init umbrella repo
cd /data/projects/myapp
git init
git remote add origin git@github.com:team/myapp-meta.git   # optional: PM enters URL later

# 3. Init Beads
br init
# → Creates .beads/beads.db, .beads/config.yaml

# 4. Init CM project rules
mkdir -p .cass
echo '{}' > .cass/config.json
touch .cass/playbook.yaml

# 5. Create .gitignore
cat > .gitignore << 'EOF'
# Beads SQLite (binary, rebuilt from JSONL)
.beads/beads.db
.beads/beads.db-wal
.beads/beads.db-shm

# Code repos (each repo has its own .git, umbrella does not track code)
repos/

# Session state
.ccu/

# Workspace app data
data/

# OS
.DS_Store
EOF

# 6. Initial commit
git add .
git commit -m "Init project: MyApp"

# 7. Push (if remote exists)
git push -u origin main
```

**Result on disk:**

```
/data/projects/myapp/
├── .git/                    ← Umbrella repo
├── .gitignore
├── .beads/
│   ├── beads.db             ← Gitignored (binary)
│   ├── beads.db-wal         ← Gitignored
│   ├── config.yaml          ← Tracked
│   └── issues.jsonl         ← Tracked (no issues yet, file is empty)
├── .cass/
│   ├── config.json          ← Tracked
│   └── playbook.yaml        ← Tracked
└── repos/                   ← Gitignored (code repos inside have their own .git)
```

### 2. Add Repos

PM goes to **Settings > Repos > [+ Add]**.

**Clone mode:**

```bash
cd /data/projects/myapp
git clone git@github.com:team/backend.git repos/backend
git clone git@github.com:team/frontend.git repos/frontend
```

**Link mode** (repo already cloned on host):

```bash
ln -s /Users/dev/existing-mobile-app /data/projects/myapp/repos/mobile
```

**Result:**

```
/data/projects/myapp/
├── .git/                          ← Umbrella
├── .beads/                        ← Shared beads
├── repos/
│   ├── backend/                   ← Its own .git, remote: team/backend
│   │   ├── .git/
│   │   ├── src/
│   │   └── package.json
│   ├── frontend/                  ← Its own .git, remote: team/frontend
│   │   ├── .git/
│   │   └── src/
│   └── mobile -> /Users/dev/...   ← Symlink, .git at source
└── .ccu/
```

**Note:** `repos/` is in the umbrella's `.gitignore`. The umbrella does NOT track code repos. Each code repo has its own git lifecycle.

### 3. Create Epic

PM triages capture → creates Epic "Auth Refactor" targeting backend + frontend.

```bash
# Workspace app runs (cwd = /data/projects/myapp):
br create --type epic --title "Auth Refactor" --priority 1 --labels "backend,frontend" --json
# → bd-42 created

br sync --flush-only
# → .beads/issues.jsonl updated on disk
```

**Sync umbrella repo** (auto, since this is a critical event):

```bash
cd /data/projects/myapp
git add .beads/issues.jsonl
git commit -m "beads: create Epic bd-42 Auth Refactor"
git push origin main
```

### 4. Start Agent Session

PM clicks **"Start"** on the Epic card.

**Step 1 — Pull latest code repos:**

```bash
# In EACH code repo that the Epic targets:
cd /data/projects/myapp/repos/backend
git checkout main
git pull origin main

cd /data/projects/myapp/repos/frontend
git checkout main
git pull origin main
```

**Step 2 — Create epic branch in each code repo:**

```bash
cd /data/projects/myapp/repos/backend
git checkout -b epic/auth-refactor

cd /data/projects/myapp/repos/frontend
git checkout -b epic/auth-refactor
```

**Step 3 — Spawn agent:**

```bash
claude -p --output-format=stream-json \
  --session-id <uuid> --model sonnet \
  --add-dir /data/projects/myapp/repos/backend \
  --add-dir /data/projects/myapp/repos/frontend \
  "<prompt>"
```

The agent has access to both repos. It commits on epic branches in the code repos. **The umbrella repo does not change** during this phase.

### 5. Agent Completes → Auto PR

Agent finishes → workspace app:

```bash
# Push epic branches in code repos
cd /data/projects/myapp/repos/backend
git push -u origin epic/auth-refactor

cd /data/projects/myapp/repos/frontend
git push -u origin epic/auth-refactor

# Create PR for each repo
gh pr create --repo team/backend --base main --head epic/auth-refactor \
  --title "[Epic] Auth Refactor" --body "..."
gh pr create --repo team/frontend --base main --head epic/auth-refactor \
  --title "[Epic] Auth Refactor" --body "..."
```

**Beads update** (agent is working → update status):

```bash
cd /data/projects/myapp
br update bd-42 --status in_progress --actor "BlueLake"
br sync --flush-only
# Do NOT push umbrella immediately — wait for periodic sync (every 5 minutes)
```

### 6. Review → Merge

PM reviews PRs, clicks **"Merge"**.

```bash
# 1. Merge PRs on GitHub
gh pr merge --squash <backend-pr-url>
gh pr merge --squash <frontend-pr-url>

# 2. Pull updated main in code repos (since we just merged)
cd /data/projects/myapp/repos/backend
git checkout main && git pull origin main

cd /data/projects/myapp/repos/frontend
git checkout main && git pull origin main

# 3. Close Epic in Beads
cd /data/projects/myapp
br close bd-42 --reason "Merged backend PR #45, frontend PR #67" --actor "system"

# 4. Export beads state
br sync --flush-only

# 5. CRITICAL: Commit + push umbrella repo
git add .beads/issues.jsonl
git commit -m "beads: close Epic bd-42 Auth Refactor (merged)"
git push origin main

# 6. Cleanup epic branches
cd repos/backend && git branch -D epic/auth-refactor && git push origin --delete epic/auth-refactor
cd repos/frontend && git branch -D epic/auth-refactor && git push origin --delete epic/auth-refactor
```

### 7. Periodic Beads Sync

Workspace app runs a background job every 5 minutes:

```typescript
// BeadsSyncService
async periodicSync() {
  if (!this.pendingChanges) return

  const projectRoot = this.project.project_root

  // 1. Export beads DB → JSONL
  await execFile('br', ['sync', '--flush-only'], { cwd: projectRoot })

  // 2. Check if JSONL actually changed
  const status = await git(projectRoot, ['status', '--porcelain', '.beads/issues.jsonl'])
  if (!status.trim()) return  // no changes

  // 3. Commit + push umbrella
  await git(projectRoot, ['add', '.beads/issues.jsonl'])
  await git(projectRoot, ['commit', '-m', 'beads: periodic sync'])
  await git(projectRoot, ['push', 'origin', 'main'])

  this.pendingChanges = false
}
```

**Critical events** (create epic, close epic, merge PR) trigger immediate sync — they do not wait for periodic sync.

---

## Sync Flows

### A. Workspace App → Team (push beads state)

This is the primary flow. The workspace app is the single writer for beads.

```
Mutation (create/update/close bead)
    │
    ▼
br <command> --json         # modify beads.db
    │
    ▼
br sync --flush-only        # export beads.db → issues.jsonl
    │
    ▼
If critical event:
    git add .beads/ && git commit && git push    # umbrella repo
If not:
    markDirty() → periodic sync will push later
```

### B. Team → Workspace App (pull beads state)

When someone outside the workspace app modifies beads (e.g., a CLI dev on their laptop).

```
Workspace app startup:
    │
    ▼
git pull origin main        # umbrella repo — get latest issues.jsonl
    │
    ▼
br sync --import-only       # import issues.jsonl → beads.db
    │
    ▼
Board UI reflects latest state
```

**Also runs when:** a webhook/polling detects that the umbrella repo has new commits.

### C. CLI Dev → Umbrella Repo (manual sync)

A dev on their laptop wants to create a bead from the terminal (not via the web UI):

```bash
# 1. Pull latest beads state
cd /path/to/myproject
git pull origin main
br sync --import-only

# 2. Create bead
br create --title "Fix timeout bug" --type bug --priority 0

# 3. Push beads state
br sync --flush-only
git add .beads/issues.jsonl
git commit -m "beads: add bug bd-50 Fix timeout"
git push origin main
```

**Workspace app** will pick up this change during periodic sync (pull → import).

### D. Conflict Resolution

When the workspace app pushes but the umbrella repo has already been updated by a CLI dev:

```
Workspace app: git push origin main
    │
    ▼
REJECTED (remote has new commits)
    │
    ▼
git pull --rebase origin main
    │
    ├── No conflict → git push origin main ✅
    │
    └── Conflict on issues.jsonl:
        │
        ▼
     br sync --merge        # 3-way merge: base + local DB + remote JSONL
        │
        ├── Merge OK → git add .beads/ → git rebase --continue → git push ✅
        │
        └── Merge FAIL (or rebase still conflicting):
            │
            ▼
         git rebase --abort                    # rollback, do NOT leave repo stuck
         emit 'beads:sync_conflict' via Socket.IO   # show red alert in UI
         log error + set project.sync_status = 'conflict'
         ❌ STOP — wait for TechLead to resolve manually
```

**When auto-resolve succeeds** — `br sync --merge` logic:
- Issue exists on both sides → take the version with the more recent `updated_at`
- Issue only on one side → keep it (new creation)
- Issue closed on one side, open on the other → closed wins (do not reopen)

**When auto-resolve FAILS** — server MUST:
1. `git rebase --abort` immediately (do not leave repo in a mid-rebase state)
2. Emit Socket.IO event so the UI shows a red alert
3. Send notification to TechLead
4. Set `sync_status = 'conflict'` → periodic sync pauses for this project
5. All beads mutations continue working normally (written to beads.db, UI still works) — only git sync is blocked

```typescript
// BeadsSyncService — flushAndPush with conflict handling
async flushAndPush(commitMessage: string): Promise<void> {
  const root = this.project.project_root
  const release = await this.flushMutex.acquire()

  try {
    await execFile('br', ['sync', '--flush-only'], { cwd: root })

    const status = await git(root, ['status', '--porcelain', '.beads/'])
    if (!status.trim()) return  // no changes

    await git(root, ['add', '.beads/'])
    await git(root, ['commit', '-m', commitMessage])

    try {
      await git(root, ['push', 'origin', 'main'])
    } catch (pushError) {
      // Push rejected — try rebase
      log.warn('Beads push rejected, attempting rebase...')

      try {
        await git(root, ['pull', '--rebase', 'origin', 'main'])

        // Check if rebase resulted in conflict
        const rebaseStatus = await git(root, ['status', '--porcelain'])
        if (rebaseStatus.includes('UU ') || rebaseStatus.includes('AA ')) {
          // Conflict detected during rebase — try br merge
          await execFile('br', ['sync', '--merge'], { cwd: root })
          await git(root, ['add', '.beads/'])
          await git(root, ['rebase', '--continue'])
        }

        await git(root, ['push', 'origin', 'main'])
        log.info('Beads sync conflict auto-resolved via rebase + br merge')

      } catch (rebaseError) {
        // Auto-resolve failed — abort and alert
        log.error('Beads sync conflict UNRESOLVABLE automatically', rebaseError)

        try { await git(root, ['rebase', '--abort']) } catch {}

        // Alert UI
        this.socketManager.toProject(this.project.id, 'beads:sync_conflict', {
          error: 'Beads sync conflict could not be auto-resolved',
          details: rebaseError.message,
          action_required: 'TechLead needs to resolve manually on host',
          host_command: `cd ${root} && git pull --rebase origin main`,
          timestamp: Date.now()
        })

        // Notify TechLead
        const techLeads = await this.getUsersByRole(this.project.id, 'techlead')
        for (const tl of techLeads) {
          await this.notificationService.send(tl.id, {
            type: 'sync_conflict',
            title: '🔴 Beads sync conflict — manual resolution needed',
            body: `Project "${this.project.name}" has a beads sync conflict. SSH into host and resolve.`,
            link: `/projects/${this.project.id}/settings`
          })
        }

        // Pause periodic sync for this project
        this.pauseSync('conflict')
      }
    }
  } finally {
    release()
  }
}

// TechLead resolved manually → resume sync
async resumeAfterConflictResolved(): Promise<void> {
  const root = this.project.project_root

  // Verify repo is clean
  const status = await git(root, ['status', '--porcelain'])
  if (status.includes('UU ') || status.includes('rebase')) {
    throw new Error('Repo still has unresolved conflicts')
  }

  // Re-import from potentially updated JSONL
  await execFile('br', ['sync', '--import-only'], { cwd: root })

  // Resume periodic sync
  this.resumeSync()

  // Notify team
  this.socketManager.toProject(this.project.id, 'beads:sync_resolved', {
    timestamp: Date.now()
  })
}
```

**TechLead manual resolution on host:**

```bash
# SSH into Mac Mini
cd /data/projects/myapp

# Check status
git status
# → "rebase in progress" or "diverged from origin/main"

# Option 1: Force accept remote (loses local changes not yet pushed)
git rebase --abort
git pull origin main
br sync --import-only

# Option 2: Force accept local (overwrite remote)
git rebase --abort
br sync --flush-only
git add .beads/ && git commit -m "beads: force sync from host"
git push --force-with-lease origin main

# Option 3: Manual merge
git rebase --abort
git pull origin main        # creates merge conflict markers in issues.jsonl
# Edit issues.jsonl manually or:
br sync --merge             # br attempts 3-way merge
git add .beads/ && git commit -m "beads: resolve merge conflict"
git push origin main
```

**After TechLead finishes resolving**, call the API or click the button in the UI:
```
POST /api/projects/:id/beads-sync/resume
```
→ Server runs `resumeAfterConflictResolved()` → periodic sync resumes.

---

## Git Flow Diagram

```
                    Umbrella Repo (team/myapp-meta)
                    branch: main only
                    tracks: .beads/issues.jsonl, .cass/playbook.yaml
                    ┌──────────────────────────────┐
                    │  main                         │
                    │  ● Init project               │
                    │  ● beads: create Epic bd-42   │
                    │  ● beads: periodic sync       │
                    │  ● beads: close bd-42         │
                    │  ● beads: create Epic bd-50   │
                    └──────────────────────────────┘

     Code Repo: backend (team/backend)        Code Repo: frontend (team/frontend)
     ┌─────────────────────────────┐          ┌─────────────────────────────┐
     │  main ─────●────●────●──── │          │  main ─────●────●────●──── │
     │            │         ▲      │          │            │         ▲      │
     │            │         │      │          │            │         │      │
     │   epic/auth-refactor │      │          │   epic/auth-refactor │      │
     │            ●──●──●───┘      │          │            ●──●──●───┘      │
     │            (agent commits)  │          │            (agent commits)  │
     │            squash merge     │          │            squash merge     │
     └─────────────────────────────┘          └─────────────────────────────┘

     Each repo has its own lifecycle.
     Epic branches are created/deleted by the workspace app.
     Squash merge is done by PM/TechLead via UI.
```

---

## Umbrella Remote Setup

### Option A: GitHub private repo (recommended)

```bash
# Create repo on GitHub (private)
gh repo create team/myapp-meta --private --description "Project metadata for MyApp"

# Set remote in umbrella
cd /data/projects/myapp
git remote add origin git@github.com:team/myapp-meta.git
git push -u origin main
```

**Pros:** Backup, team can clone, GitHub UI for viewing history.

### Option B: Bare repo on host (simple)

```bash
# Create bare repo on host
git init --bare /data/git-remotes/myapp-meta.git

# Set remote in umbrella
cd /data/projects/myapp
git remote add origin /data/git-remotes/myapp-meta.git
git push -u origin main
```

**Pros:** No GitHub needed, completely local. **Cons:** No offsite backup.

### Option C: No remote

Umbrella repo only exists on the Mac Mini. Not pushed anywhere.

**When to use:** Small team, only uses the web UI, no CLI devs.
**Risk:** Losing the Mac Mini = losing beads history (beads.db can be rebuilt from JSONL, but JSONL is also lost).

---

## When the Project Has a Single Repo

If the team only has 1 repo (monorepo or single service), the umbrella still works:

```
/data/projects/myapp/
├── .git/                    ← Umbrella
├── .beads/
├── .cass/
├── .gitignore
└── repos/
    └── app/                 ← Single code repo
        ├── .git/
        └── src/
```

Everything works the same. There is just 1 code repo instead of many. Epic branches are only created in `repos/app/`.

**Alternative:** Place `.beads/` directly in the code repo (skip umbrella).
**Not recommended** because: beads commits are intermixed with code commits, code reviewers see `issues.jsonl` changes in every PR, harder to keep separate.

---

## Workspace App Startup Sequence

```typescript
async function initializeProject(project: Project) {
  const root = project.project_root

  // 1. Pull umbrella repo if it has a remote
  const hasRemote = await git(root, ['remote']).then(r => r.trim().length > 0)
  if (hasRemote) {
    await git(root, ['pull', 'origin', 'main'])
  }

  // 2. Import beads state from JSONL → DB
  await execFile('br', ['sync', '--import-only'], { cwd: root })

  // 3. Verify beads healthy
  const stats = await execFile('br', ['stats', '--json'], { cwd: root })
  log.info(`Beads loaded: ${JSON.parse(stats).total} issues`)

  // 4. Pull code repos
  const repos = await db.select().from(reposTable).where(eq(reposTable.project_id, project.id))
  for (const repo of repos) {
    try {
      await git(repo.path, ['checkout', repo.default_branch])
      await git(repo.path, ['pull', 'origin', repo.default_branch])
    } catch (e) {
      log.warn(`Failed to pull ${repo.name}: ${e.message}`)
      // Non-fatal: repo might be on a different branch, offline, etc.
    }
  }

  // 5. Start periodic beads sync
  beadsSyncService.start(project)

  // 6. Recover orphaned sessions (if server just restarted)
  await recoverOrphanedSessions(project)
}
```

---

## Cheatsheet

### Who does what with git?

| Action | Umbrella repo | Code repos |
|--------|:---:|:---:|
| Workspace app creates Epic | `commit + push .beads/` | — |
| Agent spawn | — | `pull main`, `checkout -b epic/...` |
| Agent working | — | `commit` (on epic branch) |
| Agent done | — | `push epic branch` |
| Auto PR | — | `gh pr create` |
| PM merge | `commit + push .beads/` (close epic) | `gh pr merge --squash`, `pull main`, delete branch |
| Periodic sync | `commit + push .beads/` (if dirty) | — |
| CLI dev creates bead | `commit + push .beads/` | — |
| App startup | `pull` | `pull main` |

### br commands — cwd is always project root

```bash
# All br commands run from the project root
cd /data/projects/myapp

br list --json              # List all issues
br create --title "..."     # Create issue
br show bd-42 --json        # Detail for 1 issue
br close bd-42 --reason "." # Close issue
br sync --flush-only        # Export DB → JSONL (after each mutation)
br sync --import-only       # Import JSONL → DB (after git pull)
br sync --merge             # 3-way merge (when conflict)
```

### When to commit + push umbrella?

```
IMMEDIATE (right away):
  ✓ Create Epic
  ✓ Close Epic (merge PR)
  ✓ Delete Epic
  ✓ Triage capture → bead

PERIODIC (every 5 minutes, if there are changes):
  ✓ Update bead status
  ✓ Add/remove labels
  ✓ Add comments
  ✓ Update priority
  ✓ Agent closes child beads
```
