# Umbrella Repo Workflow — claude-team-ws

## Tổng quan

Mỗi project trong workspace được back bởi một **umbrella repo** — một git repo nhẹ chỉ track metadata dự án (Beads state, CM rules, project config), không track source code. Source code nằm trong các **code repos** riêng biệt bên trong thư mục `repos/`.

```
myproject/                  ← Umbrella repo (.git ở đây)
├── .beads/issues.jsonl     ← Tracked: issue state cho toàn team
├── .cass/playbook.yaml     ← Tracked: team rules
├── repos/
│   ├── backend/            ← Code repo riêng (.git riêng)
│   └── frontend/           ← Code repo riêng (.git riêng)
└── .ccu/                   ← Gitignored: ephemeral session state
```

**2 tầng git hoàn toàn độc lập:**

| | Umbrella repo | Code repos |
|---|---|---|
| **Path** | `myproject/` | `myproject/repos/backend/`, `myproject/repos/frontend/` |
| **Tracks** | `.beads/issues.jsonl`, `.cass/`, config | Source code, tests, configs |
| **Commit frequency** | Vài lần/ngày (khi beads state thay đổi) | Liên tục (agent commits, dev commits) |
| **Who pushes** | Workspace app (auto) | Agents (auto), devs (manual) |
| **Remote** | Private repo riêng (vd: `team/myproject-meta`) | Repos chính của team (vd: `team/backend`) |
| **Branch strategy** | Chỉ `main` (không branch) | `main` + `epic/<slug>` branches |

---

## Vòng đời Project

### 1. Tạo Project

PM click **"New Project"** trong workspace UI.

```
POST /api/projects { "name": "MyApp", "slug": "myapp" }
```

**Server thực hiện:**

```bash
# 1. Tạo project directory
mkdir -p /data/projects/myapp/repos

# 2. Init umbrella repo
cd /data/projects/myapp
git init
git remote add origin git@github.com:team/myapp-meta.git   # optional: PM nhập URL sau

# 3. Init Beads
br init
# → Tạo .beads/beads.db, .beads/config.yaml

# 4. Init CM project rules
mkdir -p .cass
echo '{}' > .cass/config.json
touch .cass/playbook.yaml

# 5. Tạo .gitignore
cat > .gitignore << 'EOF'
# Beads SQLite (binary, rebuilt từ JSONL)
.beads/beads.db
.beads/beads.db-wal
.beads/beads.db-shm

# Code repos (mỗi repo có .git riêng, umbrella không track code)
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

# 7. Push (nếu có remote)
git push -u origin main
```

**Kết quả trên disk:**

```
/data/projects/myapp/
├── .git/                    ← Umbrella repo
├── .gitignore
├── .beads/
│   ├── beads.db             ← Gitignored (binary)
│   ├── beads.db-wal         ← Gitignored
│   ├── config.yaml          ← Tracked
│   └── issues.jsonl         ← Tracked (chưa có issues, file trống)
├── .cass/
│   ├── config.json          ← Tracked
│   └── playbook.yaml        ← Tracked
└── repos/                   ← Gitignored (code repos bên trong có .git riêng)
```

### 2. Thêm Repos

PM vào **Settings > Repos > [+ Add]**.

**Clone mode:**

```bash
cd /data/projects/myapp
git clone git@github.com:team/backend.git repos/backend
git clone git@github.com:team/frontend.git repos/frontend
```

**Link mode** (repo đã clone sẵn trên host):

```bash
ln -s /Users/dev/existing-mobile-app /data/projects/myapp/repos/mobile
```

**Kết quả:**

```
/data/projects/myapp/
├── .git/                          ← Umbrella
├── .beads/                        ← Shared beads
├── repos/
│   ├── backend/                   ← .git riêng, remote: team/backend
│   │   ├── .git/
│   │   ├── src/
│   │   └── package.json
│   ├── frontend/                  ← .git riêng, remote: team/frontend
│   │   ├── .git/
│   │   └── src/
│   └── mobile -> /Users/dev/...   ← Symlink, .git ở source
└── .ccu/
```

**Lưu ý:** `repos/` nằm trong `.gitignore` của umbrella. Umbrella KHÔNG track code repos. Mỗi code repo có lifecycle git riêng.

### 3. Tạo Epic

PM triage capture → tạo Epic "Auth Refactor" target backend + frontend.

```bash
# Workspace app chạy (cwd = /data/projects/myapp):
br create --type epic --title "Auth Refactor" --priority 1 --labels "backend,frontend" --json
# → bd-42 created

br sync --flush-only
# → .beads/issues.jsonl updated on disk
```

**Sync umbrella repo** (auto, vì đây là critical event):

```bash
cd /data/projects/myapp
git add .beads/issues.jsonl
git commit -m "beads: create Epic bd-42 Auth Refactor"
git push origin main
```

### 4. Start Agent Session

PM click **"Start"** trên Epic card.

**Bước 1 — Pull code repos mới nhất:**

```bash
# Trong MỖI code repo mà Epic target:
cd /data/projects/myapp/repos/backend
git checkout main
git pull origin main

cd /data/projects/myapp/repos/frontend
git checkout main
git pull origin main
```

**Bước 2 — Tạo epic branch trong mỗi code repo:**

```bash
cd /data/projects/myapp/repos/backend
git checkout -b epic/auth-refactor

cd /data/projects/myapp/repos/frontend
git checkout -b epic/auth-refactor
```

**Bước 3 — Spawn agent:**

```bash
claude -p --output-format=stream-json \
  --session-id <uuid> --model sonnet \
  --add-dir /data/projects/myapp/repos/backend \
  --add-dir /data/projects/myapp/repos/frontend \
  "<prompt>"
```

Agent có access cả 2 repos. Commits trên epic branches trong code repos. **Umbrella repo không thay đổi** trong phase này.

### 5. Agent Completes → Auto PR

Agent xong → workspace app:

```bash
# Push epic branches trong code repos
cd /data/projects/myapp/repos/backend
git push -u origin epic/auth-refactor

cd /data/projects/myapp/repos/frontend
git push -u origin epic/auth-refactor

# Tạo PR cho mỗi repo
gh pr create --repo team/backend --base main --head epic/auth-refactor \
  --title "[Epic] Auth Refactor" --body "..."
gh pr create --repo team/frontend --base main --head epic/auth-refactor \
  --title "[Epic] Auth Refactor" --body "..."
```

**Beads update** (agent đang work → update status):

```bash
cd /data/projects/myapp
br update bd-42 --status in_progress --actor "BlueLake"
br sync --flush-only
# KHÔNG push umbrella ngay — chờ periodic sync (mỗi 5 phút)
```

### 6. Review → Merge

PM review PRs, click **"Merge"**.

```bash
# 1. Merge PRs trên GitHub
gh pr merge --squash <backend-pr-url>
gh pr merge --squash <frontend-pr-url>

# 2. Pull main mới trong code repos (vì vừa merge)
cd /data/projects/myapp/repos/backend
git checkout main && git pull origin main

cd /data/projects/myapp/repos/frontend
git checkout main && git pull origin main

# 3. Close Epic trong Beads
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

Workspace app chạy background job mỗi 5 phút:

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

**Critical events** (create epic, close epic, merge PR) trigger immediate sync — không chờ periodic.

---

## Sync Flows

### A. Workspace App → Team (push beads state)

Đây là flow chính. Workspace app là single writer cho beads.

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
Nếu critical event:
    git add .beads/ && git commit && git push    # umbrella repo
Nếu không:
    markDirty() → periodic sync sẽ push sau
```

### B. Team → Workspace App (pull beads state)

Khi ai đó ngoài workspace app modify beads (vd: CLI dev trên laptop).

```
Workspace app startup:
    │
    ▼
git pull origin main        # umbrella repo — lấy issues.jsonl mới nhất
    │
    ▼
br sync --import-only       # import issues.jsonl → beads.db
    │
    ▼
Board UI reflects latest state
```

**Cũng chạy khi:** nhận webhook/polling phát hiện umbrella repo có commits mới.

### C. CLI Dev → Umbrella Repo (manual sync)

Dev trên laptop muốn tạo bead từ terminal (không qua web UI):

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

**Workspace app** sẽ pick up thay đổi này trong periodic sync (pull → import).

### D. Conflict Resolution

Khi workspace app push nhưng umbrella repo đã bị update bởi CLI dev:

```
Workspace app: git push origin main
    │
    ▼
REJECTED (remote has new commits)
    │
    ▼
git pull --rebase origin main
    │
    ├── Không conflict → git push origin main ✅
    │
    └── Conflict trên issues.jsonl:
        │
        ▼
     br sync --merge        # 3-way merge: base + local DB + remote JSONL
        │
        ├── Merge OK → git add .beads/ → git rebase --continue → git push ✅
        │
        └── Merge FAIL (hoặc rebase vẫn conflict):
            │
            ▼
         git rebase --abort                    # rollback, KHÔNG để repo stuck
         emit 'beads:sync_conflict' via Socket.IO   # báo đỏ lên UI
         log error + set project.sync_status = 'conflict'
         ❌ STOP — chờ TechLead resolve thủ công
```

**Khi auto-resolve thành công** — `br sync --merge` logic:
- Issue tồn tại ở cả 2 sides → lấy version có `updated_at` mới hơn
- Issue chỉ ở 1 side → giữ nguyên (new creation)
- Issue closed ở 1 side, open ở side kia → closed wins (không reopen)

**Khi auto-resolve FAIL** — server PHẢI:
1. `git rebase --abort` ngay lập tức (không để repo ở trạng thái rebase dở)
2. Emit Socket.IO event để UI hiện alert đỏ
3. Gửi notification cho TechLead
4. Set `sync_status = 'conflict'` → periodic sync tạm dừng cho project này
5. Mọi beads mutations vẫn hoạt động bình thường (ghi vào beads.db, UI vẫn chạy) — chỉ sync ra git bị block

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

**TechLead manual resolution trên host:**

```bash
# SSH vào Mac Mini
cd /data/projects/myapp

# Xem trạng thái
git status
# → "rebase in progress" hoặc "diverged from origin/main"

# Option 1: Force accept remote (mất local changes chưa push)
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

**Sau khi TechLead resolve xong**, gọi API hoặc click button trong UI:
```
POST /api/projects/:id/beads-sync/resume
```
→ Server chạy `resumeAfterConflictResolved()` → periodic sync hoạt động lại.

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

     Mỗi repo có lifecycle riêng.
     Epic branches tạo/xóa bởi workspace app.
     Squash merge bởi PM/TechLead qua UI.
```

---

## Umbrella Remote Setup

### Option A: GitHub private repo (recommended)

```bash
# Tạo repo trên GitHub (private)
gh repo create team/myapp-meta --private --description "Project metadata for MyApp"

# Set remote trong umbrella
cd /data/projects/myapp
git remote add origin git@github.com:team/myapp-meta.git
git push -u origin main
```

**Ưu điểm:** Backup, team có thể clone, GitHub UI xem history.

### Option B: Bare repo trên host (simple)

```bash
# Tạo bare repo trên host
git init --bare /data/git-remotes/myapp-meta.git

# Set remote trong umbrella
cd /data/projects/myapp
git remote add origin /data/git-remotes/myapp-meta.git
git push -u origin main
```

**Ưu điểm:** Không cần GitHub, hoàn toàn local. **Nhược:** Không có offsite backup.

### Option C: Không có remote

Umbrella repo chỉ tồn tại trên Mac Mini. Không push đi đâu.

**Khi nào dùng:** Team nhỏ, chỉ dùng web UI, không có CLI devs.
**Rủi ro:** Mất Mac Mini = mất beads history (beads.db có thể rebuild từ JSONL, nhưng JSONL cũng mất).

---

## Khi Project có 1 Repo duy nhất

Nếu team chỉ có 1 repo (monorepo hoặc single service), umbrella vẫn hoạt động:

```
/data/projects/myapp/
├── .git/                    ← Umbrella
├── .beads/
├── .cass/
├── .gitignore
└── repos/
    └── app/                 ← Code repo duy nhất
        ├── .git/
        └── src/
```

Mọi flow giống hệt. Chỉ có 1 code repo thay vì nhiều. Epic branches chỉ tạo trong `repos/app/`.

**Alternative:** Đặt `.beads/` trực tiếp trong code repo (skip umbrella).
**Không khuyến khích** vì: beads commits xen lẫn code commits, code reviewers thấy `issues.jsonl` changes trong mọi PR, khó tách biệt.

---

## Workspace App Startup Sequence

```typescript
async function initializeProject(project: Project) {
  const root = project.project_root

  // 1. Pull umbrella repo nếu có remote
  const hasRemote = await git(root, ['remote']).then(r => r.trim().length > 0)
  if (hasRemote) {
    await git(root, ['pull', 'origin', 'main'])
  }

  // 2. Import beads state từ JSONL → DB
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

  // 6. Recover orphaned sessions (nếu server vừa restart)
  await recoverOrphanedSessions(project)
}
```

---

## Cheatsheet

### Ai làm gì với git?

| Action | Umbrella repo | Code repos |
|--------|:---:|:---:|
| Workspace app tạo Epic | `commit + push .beads/` | — |
| Agent spawn | — | `pull main`, `checkout -b epic/...` |
| Agent working | — | `commit` (trên epic branch) |
| Agent done | — | `push epic branch` |
| Auto PR | — | `gh pr create` |
| PM merge | `commit + push .beads/` (close epic) | `gh pr merge --squash`, `pull main`, delete branch |
| Periodic sync | `commit + push .beads/` (if dirty) | — |
| CLI dev tạo bead | `commit + push .beads/` | — |
| App startup | `pull` | `pull main` |

### br commands — cwd luôn là project root

```bash
# Tất cả br commands chạy từ project root
cd /data/projects/myapp

br list --json              # List tất cả issues
br create --title "..."     # Tạo issue
br show bd-42 --json        # Chi tiết 1 issue
br close bd-42 --reason "." # Close issue
br sync --flush-only        # Export DB → JSONL (sau mỗi mutation)
br sync --import-only       # Import JSONL → DB (sau git pull)
br sync --merge             # 3-way merge (khi conflict)
```

### Khi nào commit + push umbrella?

```
IMMEDIATE (ngay lập tức):
  ✓ Tạo Epic
  ✓ Close Epic (merge PR)
  ✓ Delete Epic
  ✓ Triage capture → bead

PERIODIC (mỗi 5 phút, nếu có thay đổi):
  ✓ Update bead status
  ✓ Add/remove labels
  ✓ Add comments
  ✓ Update priority
  ✓ Agent closes child beads
```
