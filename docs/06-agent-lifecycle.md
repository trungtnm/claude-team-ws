# Agent Lifecycle & Execution Engine — claude-team-ws

## Overview

Agent lifecycle quản lý toàn bộ vòng đời của một Claude Code session, từ lúc PM click "Start" đến khi PR được merge.

```
Trigger → Scope Gate → Git Branch → Context Build → Spawn → Stream → Complete → PR → Review → Merge
```

---

## Crash Recovery (Server Restart)

Khi Express server crash hoặc restart (PM2 auto-restart, deploy update), các claude CLI processes đang chạy vẫn sống (orphaned processes). Server cần re-attach.

### On Startup: Recovery Sequence

```typescript
async function recoverOrphanedSessions(): Promise<void> {
  // 1. Find sessions marked as 'running' or 'waiting_input' in DB
  const orphaned = await db.select()
    .from(sessions)
    .where(inArray(sessions.status, ['running', 'waiting_input']))

  for (const session of orphaned) {
    if (!session.pid) {
      // No PID recorded — mark as failed
      await markSessionFailed(session.id, 'Server restarted before PID recorded')
      continue
    }

    // 2. Check if PID is still alive
    const isAlive = isPidAlive(session.pid)

    if (isAlive) {
      // 3a. Process still running — re-attach to stdout
      log.info(`Re-attaching to session ${session.id} (PID ${session.pid})`)

      // Re-open /proc/<pid>/fd/1 or use ptrace — platform-specific
      // On macOS: cannot re-attach to stdout of existing process easily
      // Pragmatic solution: mark as "detached", let it finish naturally
      await db.update(sessions)
        .set({ status: 'detached' })
        .where(eq(sessions.id, session.id))

      // Monitor PID for exit (poll every 5s)
      monitorPidForExit(session.pid, session.id)
    } else {
      // 3b. Process dead — mark as failed
      log.warn(`Session ${session.id} (PID ${session.pid}) is dead`)
      await markSessionFailed(session.id, 'Process died during server restart')

      // Clean up: check if branch was pushed, maybe resume later
      await logActivity(session.project_id, null, 'session_crash_recovered', {
        session_id: session.id,
        pid: session.pid,
        recommendation: 'Resume session manually if needed'
      })
    }
  }

  // 4. Process queue — in case slots opened up
  const projectIds = [...new Set(orphaned.map(s => s.project_id))]
  for (const pid of projectIds) {
    await agentQueue.processQueue(pid)
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0) // signal 0 = check existence, don't kill
    return true
  } catch {
    return false
  }
}

function monitorPidForExit(pid: number, sessionId: string): void {
  const interval = setInterval(async () => {
    if (!isPidAlive(pid)) {
      clearInterval(interval)
      await handleDetachedSessionExit(sessionId)
    }
  }, 5_000) // check every 5 seconds
}

async function handleDetachedSessionExit(sessionId: string): Promise<void> {
  const session = await getSession(sessionId)

  // 1. Try to recover missed events from claude session log
  const recoveredEvents = await recoverEventsFromSessionLog(session)
  if (recoveredEvents.length > 0) {
    // Store recovered events + broadcast to any connected clients
    for (const event of recoveredEvents) {
      await db.insert(sessionEvents).values({
        session_id: sessionId,
        event_type: event.type,
        data: JSON.stringify(event),
        created_at: Math.floor(Date.now() / 1000)
      })
    }
    socketManager.toSession(sessionId, 'session:events_recovered', {
      count: recoveredEvents.length
    })
  }

  // 2. Determine outcome from recovered events or git state
  const resultEvent = recoveredEvents.find(e => e.type === 'result')
  const epic = session.epic_id ? await getEpic(session.epic_id) : null

  if (resultEvent) {
    // Got the result event — agent completed normally
    await db.update(sessions)
      .set({ status: 'completed', exit_code: 0, finished_at: now() })
      .where(eq(sessions.id, sessionId))
    if (epic) await postCompletion(session)

  } else if (epic) {
    // No result event — check git as fallback
    const branchHasCommits = await gitService.branchHasNewCommits(epic)
    if (branchHasCommits) {
      await db.update(sessions)
        .set({ status: 'completed', finished_at: now() })
        .where(eq(sessions.id, sessionId))
      await postCompletion(session)
    } else {
      await markSessionFailed(sessionId, 'Detached process exited without commits or result event')
    }
  } else {
    await markSessionFailed(sessionId, 'Detached process exited, no epic linked')
  }

  await agentQueue.processQueue(session.project_id)
}

// Vì KHÔNG dùng --bare, claude ghi session log vào ~/.claude/projects/<hash>/sessions/
// Session ID đã biết → đọc log file để recover events bị miss
async function recoverEventsFromSessionLog(session: Session): Promise<any[]> {
  if (!session.claude_session_id) return []

  try {
    // Claude stores sessions at ~/.claude/projects/<project-hash>/sessions/<session-id>.jsonl
    // Find the session file
    const { stdout } = await execFile('find', [
      path.join(os.homedir(), '.claude'),
      '-name', `${session.claude_session_id}.jsonl`,
      '-type', 'f'
    ])
    const sessionFile = stdout.trim()
    if (!sessionFile) return []

    // Read the session log
    const content = await fs.readFile(sessionFile, 'utf-8')
    const allEvents = content.trim().split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line))

    // Find events we haven't stored yet
    const lastStoredId = await db.select({ id: max(sessionEvents.id) })
      .from(sessionEvents)
      .where(eq(sessionEvents.session_id, session.id))
    const storedCount = lastStoredId[0]?.id || 0

    // Return events after what we already have
    // Rough heuristic: if we have N events stored, skip first N from log
    const storedEvents = await db.select({ count: count() })
      .from(sessionEvents)
      .where(eq(sessionEvents.session_id, session.id))
    const skip = storedEvents[0]?.count || 0

    return allEvents.slice(skip)
  } catch (e) {
    log.warn(`Failed to recover events from session log: ${e.message}`)
    return []
  }
}
```

### Crash Recovery: Limitations & Mitigations

| Limitation | Impact | Mitigation |
|---|---|---|
| **Cannot re-attach stdout pipe** | Mất real-time streaming sau server restart | Recover từ session log file (xem bên dưới) |
| **PID polling mỗi 5s** | Không real-time — agent có thể xong ở giây 1, server biết ở giây 5 | Chấp nhận được — 5s delay cho crash recovery không phải vấn đề |
| **Session log có thể incomplete** | Nếu claude crash giữa chừng, log file cũng corrupt | Fallback: check git branch commits |

**Recovery priority chain** (thử từ trên xuống):

```
1. Session log file (~/.claude/.../sessions/<id>.jsonl)
   → Nguồn tốt nhất: có đầy đủ events kể cả result
   → Vì không dùng --bare, claude GHI session log

2. Git branch state
   → Fallback: check branchHasNewCommits()
   → Biết agent có làm gì không, nhưng mất chi tiết

3. Mark as failed
   → Last resort: không có evidence agent đã làm gì
   → User có thể resume session thủ công
```

**UI behavior cho detached sessions:**

```
┌────────────────────────────────────────────────────────────┐
│ ⚠ DETACHED — Server restarted while agent was running      │
│                                                            │
│ BlueLake • Rate Limiting • PID 12345 still alive           │
│                                                            │
│ Stream unavailable (server lost pipe to process).          │
│ Agent is still running. Will auto-detect completion.       │
│                                                            │
│ [Recovering events...] 45 events recovered from log        │
│                                                            │
│ ── Recovered Stream (read-only, not live) ──────────────── │
│ I'll start by reading the existing middleware...           │
│ ┌─ Tool: Read ─────────────────────────────────────┐       │
│ │ src/middleware/index.ts                      [▼] │       │
│ └──────────────────────────────────────────────────┘       │
│ ...                                                        │
│ (events up to server restart point)                        │
│                                                            │
│ ⏳ Waiting for agent to complete (checking every 5s)...     │
│                                              [Cancel]      │
└────────────────────────────────────────────────────────────┘
```

Khi PID exit detected → recovered events được supplement, status update, postCompletion trigger. UI chuyển sang trạng thái bình thường.

---

## Phase 1: Trigger & Validation

### User clicks "Start Agent Session" on Epic card

```
POST /api/projects/:projectId/sessions
{ "epic_id": "...", "model": "sonnet" }
```

### Server-side validation:

1. **Permission check**: User must be PM, Dev, or TechLead
2. **Epic status check**: ui_status must be `ready` or `draft` (not already `in_progress`)
3. **Concurrency check**: Count running sessions for project
   - If `running_count >= max_concurrent_agents` → add to queue
   - Return `{ status: "queued", position: N }`

---

## Phase 2: Scope Gate

Nếu Epic chưa được analyze:

```typescript
async function analyzeScope(epic: Epic): Promise<ScopeAnalysis> {
  // 1. Get Epic details from br
  const epicBead = await beadsService.show(epic.bead_epic_id)

  // 2. Estimate context size
  const analysis = {
    estimated_tokens: estimateTokens(epicBead.description),
    files_mentioned: extractFilePaths(epicBead.description),
    has_children: epicBead.children?.length > 0,
    complexity: assessComplexity(epicBead)
  }

  // 3. Decision
  if (analysis.estimated_tokens > 50_000 || analysis.files_mentioned.length > 15) {
    analysis.recommendation = 'split'
    analysis.proposed_beads = await generateSplitProposal(epicBead)
  } else {
    analysis.recommendation = 'proceed'
  }

  return analysis
}
```

**Nếu `recommendation = 'split'`:**
- Emit `session:scope_gate` via Socket.IO → UI hiện split proposal dialog
- PM review/edit → confirm → server tạo child beads via `br create`
- Sau đó tiếp tục spawn

**Nếu `recommendation = 'proceed'`:**
- Tiếp tục spawn ngay

---

## Phase 3: Git Branch Isolation

```typescript
async function createEpicBranch(epic: Epic, repos: Repo[]): Promise<string[]> {
  const branches: string[] = []
  const slug = slugify(epic.title) // vd: "rate-limiting"

  for (const repo of epic.targetRepos) {
    const branchName = `epic/${slug}`

    // CRITICAL: Pull latest main trước khi tạo branch
    // Tránh base trên code cũ → merge conflicts khi tạo PR
    await gitService.run(repo.path, ['checkout', repo.default_branch])
    await gitService.run(repo.path, ['pull', 'origin', repo.default_branch])

    await gitService.run(repo.path, [
      'checkout', '-b', branchName, repo.default_branch
    ])

    branches.push(branchName)
  }

  // Update epic record
  await db.update(epics)
    .set({ git_branches: JSON.stringify(branches.map((b, i) => ({
      repo: repos[i].name,
      branch: b
    })))})
    .where(eq(epics.id, epic.id))

  return branches
}
```

**Cleanup on failure:** Nếu spawn fail, delete branch:
```bash
git checkout main && git branch -D epic/<slug>
```

---

## Phase 4: Context Building

Thu thập context từ **6 nguồn** trước khi spawn agent. Agent sẽ tự explore thêm bằng Read/Glob/Grep khi chạy, nhưng initial context tốt = ít turns lãng phí = nhanh hơn + rẻ hơn.

### 6 Context Sources

```
┌─────────────────────────────────────────────────────┐
│                 Agent Prompt                         │
│                                                     │
│  1. Epic details (title, description, AC, beads)    │ ← from br
│  2. Codebase snapshot (tree, key files, patterns)   │ ← from file system
│  3. Dependency graph awareness                      │ ← from bv
│  4. CM rules (team conventions)                     │ ← from CM server
│  5. CASS learnings (past similar sessions)          │ ← from cass CLI
│  6. Execution guardrails (test/build/commit rules)  │ ← hardcoded
│                                                     │
└─────────────────────────────────────────────────────┘
```

```typescript
async function buildAgentContext(epic: Epic, project: Project): Promise<string> {
  const epicBead = await beadsService.show(epic.bead_epic_id)
  const childBeads = epicBead.children || []
  const targetRepos = JSON.parse(epic.git_branches)

  // ── 1. Epic details (from br) ──────────────────────────
  const epicSection = buildEpicSection(epicBead, childBeads)

  // ── 2. Codebase snapshot (from filesystem) ─────────────
  // Cho agent hiểu structure TRƯỚC khi nó tự explore
  const codebaseSection = await buildCodebaseSnapshot(targetRepos, epicBead)

  // ── 3. Dependency graph (from bv) ──────────────────────
  // Agent biết beads nào phải xong trước, beads nào block sau
  const graphSection = await buildGraphContext(epic.bead_epic_id)

  // ── 4. CM rules (from CM server) ───────────────────────
  const cmSection = await buildCmContext(epicBead, project)

  // ── 5. CASS learnings (from cass CLI) ──────────────────
  const cassSection = await buildCassContext(epicBead)

  // ── 6. Execution guardrails (hardcoded) ────────────────
  const guardrails = buildGuardrails(targetRepos)

  return [epicSection, codebaseSection, graphSection, cmSection, cassSection, guardrails]
    .filter(Boolean)
    .join('\n\n---\n\n')
}
```

### Source 1: Epic Details

```typescript
function buildEpicSection(epicBead: any, childBeads: any[]): string {
  return `
# Epic: ${epicBead.title}

## Description
${epicBead.description || 'No description provided.'}

## Acceptance Criteria
${extractAcceptanceCriteria(epicBead.description)}

${childBeads.length > 0 ? `## Sub-tasks (Beads)
${childBeads.map(b => `- [${b.status}] ${b.id}: ${b.title}`).join('\n')}

Complete these beads in dependency order. Close each bead when done:
\`br close <bead-id> --reason "Completed: <what was done>"\`
` : ''}`.trim()
}
```

### Source 2: Codebase Snapshot (NEW)

**Tại sao cần:** Agent sẽ tự Read/Glob khi chạy, nhưng mỗi tool call tốn 1 turn. Inject sẵn file tree + key files giúp agent hiểu codebase trong turn 1 thay vì turn 5.

```typescript
async function buildCodebaseSnapshot(
  targetRepos: Array<{ repo: string, branch: string }>,
  epicBead: any
): Promise<string> {
  const sections: string[] = []

  for (const { repo, branch } of targetRepos) {
    const repoConfig = await getRepoConfig(repo)
    const repoPath = repoConfig.path

    // a. File tree (depth 3, ignore node_modules/.git/dist)
    const tree = await execFile('find', [
      repoPath, '-maxdepth', '3',
      '-not', '-path', '*/node_modules/*',
      '-not', '-path', '*/.git/*',
      '-not', '-path', '*/dist/*',
      '-not', '-path', '*/.next/*',
    ], { cwd: repoPath })
    const relativeTree = tree.stdout
      .split('\n')
      .map(p => p.replace(repoPath, '.'))
      .filter(p => p !== '.')
      .sort()
      .join('\n')

    // b. Key config files
    const configFiles = ['package.json', 'tsconfig.json', '.env.example', 'Dockerfile']
    const configs: string[] = []
    for (const f of configFiles) {
      try {
        const content = await fs.readFile(path.join(repoPath, f), 'utf-8')
        configs.push(`### ${f}\n\`\`\`\n${content.slice(0, 500)}\n\`\`\``)
      } catch {} // file doesn't exist — skip
    }

    // c. Relevant files mentioned in Epic description
    const mentionedFiles = extractFilePaths(epicBead.description || '')
    const relevantFiles: string[] = []
    for (const f of mentionedFiles.slice(0, 5)) {  // max 5 files
      try {
        const fullPath = path.join(repoPath, f)
        const content = await fs.readFile(fullPath, 'utf-8')
        const lines = content.split('\n')
        // Include first 50 lines (enough to understand structure)
        relevantFiles.push(`### ${f} (${lines.length} lines)\n\`\`\`\n${lines.slice(0, 50).join('\n')}\n\`\`\``)
      } catch {}
    }

    // d. CLAUDE.md (if exists in repo)
    let claudeMd = ''
    try {
      claudeMd = await fs.readFile(path.join(repoPath, 'CLAUDE.md'), 'utf-8')
      claudeMd = `### CLAUDE.md (repo conventions)\n\`\`\`\n${claudeMd.slice(0, 2000)}\n\`\`\``
    } catch {}

    sections.push(`
## Codebase: ${repo} (branch: ${branch})

### File Structure
\`\`\`
${relativeTree.slice(0, 3000)}
\`\`\`

${claudeMd}

${configs.join('\n\n')}

${relevantFiles.length > 0 ? `### Files Referenced in Epic\n${relevantFiles.join('\n\n')}` : ''}
`.trim())
  }

  return sections.join('\n\n')
}
```

**Token budget:** Codebase snapshot có thể lớn. Limit:
- File tree: max 3000 chars (~100 lines)
- Config files: max 500 chars mỗi file
- Relevant files: max 5 files × 50 lines
- CLAUDE.md: max 2000 chars
- **Tổng: ~8K-15K tokens** — đáng để tiết kiệm 5-10 turns exploring

### Source 3: Dependency Graph (NEW)

```typescript
async function buildGraphContext(epicBeadId: string): Promise<string> {
  try {
    const { stdout } = await execFile('bv', [
      '--robot-triage', '--graph-root', epicBeadId
    ], { cwd: projectRoot, timeout: 10_000 })

    const triage = JSON.parse(stdout)
    if (!triage?.quick_ref) return ''

    return `
## Dependency Context

${triage.quick_ref}

**Critical path:** ${triage.critical_path?.join(' → ') || 'none'}
**Blocked by:** ${triage.blocked_by?.join(', ') || 'nothing — you can start immediately'}
**Blocks:** ${triage.blocks?.join(', ') || 'nothing downstream'}
`.trim()
  } catch {
    return ''
  }
}
```

### Source 4 & 5: CM Rules + CASS (unchanged, same as before)

```typescript
async function buildCmContext(epicBead: any, project: Project): Promise<string> {
  try {
    const cmContext = await cmClient.getContext({
      task: epicBead.title,
      description: epicBead.description,
      project: project.slug
    })
    if (cmContext.rules?.length > 0) {
      return `## Team Rules (MUST follow)\n${cmContext.rules.map(r =>
        `- [confidence: ${r.confidence.toFixed(1)}] ${r.text}`
      ).join('\n')}`
    }
  } catch (e) {
    log.warn('CM unavailable, proceeding without rules')
  }
  return ''
}

async function buildCassContext(epicBead: any): Promise<string> {
  try {
    const searchResult = await cassService.search({
      query: `${epicBead.title} ${epicBead.description?.slice(0, 200)}`,
      limit: 3,
      format: 'robot'
    })
    if (searchResult.results?.length > 0) {
      return `## Past Learnings (from similar sessions)\n${
        searchResult.results.map(r =>
          `- Session "${r.title}": ${r.summary}`
        ).join('\n')
      }`
    }
  } catch (e) {
    log.warn('CASS unavailable, proceeding without learnings')
  }
  return ''
}
```

### Source 6: Execution Guardrails (NEW)

**Tại sao hardcode trong prompt:** Claude Code CÓ thể chạy tests — nhưng không có gì ENFORCE nó phải chạy. Agent có thể code xong, commit, và push mà không test. Guardrails trong prompt = soft enforcement.

```typescript
function buildGuardrails(targetRepos: Array<{ repo: string }>): string {
  const isMultiRepo = targetRepos.length > 1

  return `
## Execution Rules (MANDATORY)

### Before EVERY commit:
1. Run the test suite: \`pnpm test\` (or equivalent)
2. Run type check: \`pnpm tsc --noEmit\` (if TypeScript)
3. Run linter: \`pnpm lint\` (if configured)
4. If any of the above fail, fix before committing

### Before considering work complete:
1. ALL acceptance criteria must be met
2. ALL tests must pass
3. Build must succeed: \`pnpm build\`
4. No TODO/FIXME/HACK markers left in new code

### Commit discipline:
- Commit frequently (after each logical unit of work)
- Commit messages: \`feat|fix|refactor|test: <description>\`
- Include bead ID in commits when closing beads: \`feat: add rate limiter [bd-43]\`
${isMultiRepo ? `
### Multi-repo rules:
- You are working across ${targetRepos.length} repos: ${targetRepos.map(r => r.repo).join(', ')}
- Changes MUST be consistent across repos
- If backend adds an API endpoint, frontend must consume it (or vice versa)
- Test cross-repo integration: verify API contracts match
- Commit to ALL repos before considering work complete
- If you cannot complete changes in one repo, do NOT commit partial work in the other
` : ''}
### When done:
- Do NOT push branches — the workspace will handle pushing and PR creation
- Simply confirm "Work complete" when all criteria are met
`.trim()
}
```

**Lưu ý cuối cùng về guardrails:** Đây là soft enforcement qua prompt. Agent CÓ THỂ ignore. Hard enforcement nằm ở Phase 9 (post-completion validation) — xem bên dưới.

---

## Phase 5: Agent Spawn

```typescript
async function spawnAgent(session: Session, prompt: string): Promise<void> {
  const claudeSessionId = crypto.randomUUID()

  // Build CLI args
  // NOTE: KHÔNG dùng --bare. Lý do:
  // --bare skip session persistence → ~/.claude/ không ghi session log
  // → cass index không tìm thấy session → Shared Memory (CASS) bị vô hiệu hóa
  // Trade-off: không có --bare, claude sẽ load hooks + LSP + plugin sync
  // → chậm hơn ~2-3s khi khởi động, nhưng giữ được CASS integration
  const args = [
    '-p',                                    // Print mode (non-interactive)
    '--output-format=stream-json',           // NDJSON streaming
    '--verbose',                             // Include tool details
    '--session-id', claudeSessionId,         // For resume
    '--model', session.model,                // sonnet/opus/haiku
    '--add-dir', project.repos[0].path,      // Project access
    prompt
  ]

  // Spawn process
  const proc = spawn('claude', args, {
    cwd: project.repos[0].path,
    env: {
      ...process.env,
      // Inject Agent Mail config for the agent
      MCP_AGENT_MAIL_URL: config.agentMailUrl,
      MCP_AGENT_MAIL_TOKEN: config.agentMailToken,
    },
    stdio: ['pipe', 'pipe', 'pipe']
  })

  // Record PID
  await db.update(sessions)
    .set({
      pid: proc.pid,
      claude_session_id: claudeSessionId,
      status: 'running',
      started_at: Math.floor(Date.now() / 1000)
    })
    .where(eq(sessions.id, session.id))

  // Stream stdout (NDJSON)
  const rl = readline.createInterface({ input: proc.stdout })
  rl.on('line', async (line) => {
    try {
      const event = JSON.parse(line)
      await handleStreamEvent(session.id, event)
    } catch (e) {
      // Non-JSON line (rare) — log as system event
      await storeEvent(session.id, 'system', { raw: line })
    }
  })

  // Stream stderr
  proc.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    storeEvent(session.id, 'error', { message: text })
    socketManager.toSession(session.id, 'session:event', {
      event_type: 'error', data: { message: text }
    })
  })

  // Handle exit
  proc.on('exit', (code, signal) => {
    handleAgentExit(session.id, code, signal)
  })
}
```

---

## Phase 6: Stream Processing

```typescript
async function handleStreamEvent(sessionId: string, event: any): Promise<void> {
  // 1. Determine event type
  const eventType = classifyEvent(event)

  // 2. Store in DB
  const stored = await db.insert(sessionEvents).values({
    session_id: sessionId,
    event_type: eventType,
    data: JSON.stringify(event),
    created_at: Math.floor(Date.now() / 1000)
  }).returning()

  // 3. Broadcast via Socket.IO
  socketManager.toSession(sessionId, 'session:event', {
    session_id: sessionId,
    event_id: stored[0].id,
    event_type: eventType,
    data: event,
    timestamp: Date.now()
  })

  // 4. Handle special events
  if (eventType === 'tool_use' && event.tool?.name === 'AskUserQuestion') {
    await handleAskUserQuestion(sessionId, event)
  }

  // 5. Periodic progress update (every 10 events)
  if (stored[0].id % 10 === 0) {
    await emitProgressUpdate(sessionId)
  }
}

function classifyEvent(event: any): string {
  if (event.type === 'system') return 'system'
  if (event.type === 'assistant') return 'assistant'
  if (event.type === 'tool_use') return 'tool_use'
  if (event.type === 'tool_result') return 'tool_result'
  if (event.type === 'result') return 'result'
  return 'system'
}
```

---

## Phase 7: AskUserQuestion Handling

3 modes, configurable per project.

```typescript
async function handleAskUserQuestion(sessionId: string, event: any): Promise<void> {
  const session = await getSession(sessionId)
  const project = await getProject(session.project_id)
  const mode = project.ask_question_mode // 'pause' | 'auto' | 'hybrid'

  const question = {
    id: event.tool?.input?.question_id || crypto.randomUUID(),
    text: event.tool?.input?.question || '',
    options: event.tool?.input?.options || null,
    context: extractContext(event)
  }

  if (mode === 'pause') {
    // Always pause and ask human
    await pauseAndAsk(sessionId, question, 'pause', 'high')

  } else if (mode === 'auto') {
    // Always auto-answer using CM rules + CASS
    const autoAnswer = await generateAutoAnswer(question, session)
    await submitAnswer(sessionId, question.id, autoAnswer, 'auto')

  } else if (mode === 'hybrid') {
    // Assess risk level
    const risk = assessQuestionRisk(question)

    if (risk === 'low') {
      // Auto-answer with timeout
      const autoAnswer = await generateAutoAnswer(question, session)
      await pauseAndAsk(sessionId, question, 'hybrid', 'low', autoAnswer, 30) // 30s timeout
    } else {
      // Pause for human
      await pauseAndAsk(sessionId, question, 'hybrid', 'high')
    }
  }
}

function assessQuestionRisk(question: Question): 'low' | 'high' {
  const lowRiskPatterns = [
    /naming|name|variable/i,
    /style|format|convention/i,
    /import|export/i,
    /file location|directory/i,
  ]

  const highRiskPatterns = [
    /architect/i,
    /api.*design|endpoint.*design/i,
    /database|schema|migration/i,
    /security|auth|permission/i,
    /delete|remove|drop/i,
    /breaking.*change/i,
  ]

  if (highRiskPatterns.some(p => p.test(question.text))) return 'high'
  if (lowRiskPatterns.some(p => p.test(question.text))) return 'low'
  return 'high' // default to safe
}

async function pauseAndAsk(
  sessionId: string,
  question: Question,
  mode: string,
  riskLevel: string,
  autoAnswer?: string,
  timeoutSeconds?: number
): Promise<void> {
  // Update session status
  await db.update(sessions)
    .set({ status: 'waiting_input' })
    .where(eq(sessions.id, sessionId))

  // Emit to session room
  socketManager.toSession(sessionId, 'session:question', {
    session_id: sessionId,
    question,
    mode,
    risk_level: riskLevel,
    auto_answer: autoAnswer || null,
    timeout_seconds: timeoutSeconds || null
  })

  // Send notification
  const session = await getSession(sessionId)
  await notificationService.send(session.user_id, {
    type: 'question_waiting',
    title: `Agent needs input: ${question.text.slice(0, 50)}...`,
    link: `/projects/${session.project_id}/agents?session=${sessionId}`
  })

  // Auto-accept timeout (for hybrid LOW risk)
  if (timeoutSeconds && autoAnswer) {
    setTimeout(async () => {
      const currentStatus = await getSessionStatus(sessionId)
      if (currentStatus === 'waiting_input') {
        await submitAnswer(sessionId, question.id, autoAnswer, 'timeout')
      }
    }, timeoutSeconds * 1000)
  }
}
```

---

## Phase 8: Agent Completion

```typescript
async function handleAgentExit(
  sessionId: string,
  exitCode: number | null,
  signal: string | null
): Promise<void> {
  const session = await getSession(sessionId)

  // 1. Determine final status
  let status: string
  if (signal === 'SIGTERM' || signal === 'SIGKILL') {
    status = 'cancelled'
  } else if (exitCode === 0) {
    status = 'completed'
  } else {
    status = 'failed'
  }

  // 2. Update session
  await db.update(sessions)
    .set({
      status,
      exit_code: exitCode,
      finished_at: Math.floor(Date.now() / 1000)
    })
    .where(eq(sessions.id, sessionId))

  // 3. Emit lifecycle event
  socketManager.toProject(session.project_id, 'session:lifecycle', {
    session: { id: sessionId, status, epic_id: session.epic_id },
    event: status
  })
  socketManager.toSession(sessionId, `session:${status}`, {
    session_id: sessionId, exit_code: exitCode
  })

  // 4. If completed successfully → trigger post-completion
  if (status === 'completed' && session.epic_id) {
    await postCompletion(session)
  }

  // 5. Process queue → spawn next queued session
  await processQueue(session.project_id)
}
```

---

## Phase 9: Pre-Push Validation (Hard Enforcement)

Guardrails trong prompt là soft enforcement — agent có thể ignore. Phase 9 chạy validation trên server-side TRƯỚC khi push branch và tạo PR. Nếu fail → KHÔNG push, KHÔNG tạo PR.

```typescript
interface ValidationResult {
  passed: boolean
  checks: Array<{
    name: string
    status: 'pass' | 'fail' | 'skip'
    output?: string
  }>
}

async function validateBeforePush(
  session: Session,
  repos: Array<{ repo: string, branch: string, path: string }>
): Promise<ValidationResult> {
  const checks: ValidationResult['checks'] = []

  for (const { repo, path: repoPath, branch } of repos) {
    // ── Check 1: Branch has commits ──────────────────────
    const commitCount = await git(repoPath, [
      'rev-list', '--count', `${getDefaultBranch(repo)}..${branch}`
    ])
    if (parseInt(commitCount.trim()) === 0) {
      checks.push({ name: `${repo}: has commits`, status: 'fail', output: 'No commits on epic branch' })
      continue  // skip other checks if no commits
    }
    checks.push({ name: `${repo}: has commits`, status: 'pass' })

    // ── Check 2: Tests pass ──────────────────────────────
    try {
      const testCmd = await detectTestCommand(repoPath)  // 'pnpm test', 'npm test', 'pytest', etc.
      if (testCmd) {
        const { stdout, stderr } = await execFile('sh', ['-c', testCmd], {
          cwd: repoPath,
          timeout: 300_000  // 5 min timeout for tests
        })
        checks.push({ name: `${repo}: tests`, status: 'pass', output: stdout.slice(-500) })
      } else {
        checks.push({ name: `${repo}: tests`, status: 'skip', output: 'No test command detected' })
      }
    } catch (e: any) {
      checks.push({ name: `${repo}: tests`, status: 'fail', output: e.stderr?.slice(-1000) || e.message })
    }

    // ── Check 3: Build succeeds ──────────────────────────
    try {
      const buildCmd = await detectBuildCommand(repoPath)
      if (buildCmd) {
        await execFile('sh', ['-c', buildCmd], { cwd: repoPath, timeout: 300_000 })
        checks.push({ name: `${repo}: build`, status: 'pass' })
      } else {
        checks.push({ name: `${repo}: build`, status: 'skip', output: 'No build command detected' })
      }
    } catch (e: any) {
      checks.push({ name: `${repo}: build`, status: 'fail', output: e.stderr?.slice(-1000) || e.message })
    }

    // ── Check 4: TypeScript type check ───────────────────
    const hasTsconfig = await fileExists(path.join(repoPath, 'tsconfig.json'))
    if (hasTsconfig) {
      try {
        await execFile('npx', ['tsc', '--noEmit'], { cwd: repoPath, timeout: 120_000 })
        checks.push({ name: `${repo}: typecheck`, status: 'pass' })
      } catch (e: any) {
        checks.push({ name: `${repo}: typecheck`, status: 'fail', output: e.stdout?.slice(-1000) })
      }
    }

    // ── Check 5: No forbidden patterns in diff ───────────
    const diff = await git(repoPath, ['diff', `${getDefaultBranch(repo)}..${branch}`, '--unified=0'])
    const forbidden = [
      { pattern: /<<<<<<|>>>>>>|=======/g, name: 'merge conflict markers' },
      { pattern: /console\.log\(/g, name: 'console.log (use structured logging)' },
      { pattern: /\.only\(/g, name: 'test.only / describe.only' },
      { pattern: /TODO.*HACK|FIXME.*HACK/gi, name: 'HACK markers' },
    ]
    for (const { pattern, name } of forbidden) {
      const matches = diff.match(pattern)
      if (matches && matches.length > 0) {
        checks.push({ name: `${repo}: no ${name}`, status: 'fail', output: `Found ${matches.length} occurrences` })
      }
    }
  }

  // ── Multi-repo consistency check ─────────────────────
  if (repos.length > 1) {
    // Check all repos have commits (not partial completion)
    const reposWithCommits = checks.filter(c => c.name.endsWith(': has commits') && c.status === 'pass')
    if (reposWithCommits.length < repos.length && reposWithCommits.length > 0) {
      checks.push({
        name: 'multi-repo: all repos have changes',
        status: 'fail',
        output: `Only ${reposWithCommits.length}/${repos.length} repos have commits. Partial completion detected.`
      })
    }
  }

  const passed = checks.every(c => c.status === 'pass' || c.status === 'skip')
  return { passed, checks }
}

// Detect test/build commands from package.json, Makefile, etc.
async function detectTestCommand(repoPath: string): Promise<string | null> {
  try {
    const pkg = JSON.parse(await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8'))
    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      const pm = await fileExists(path.join(repoPath, 'pnpm-lock.yaml')) ? 'pnpm' : 'npm'
      return `${pm} test`
    }
  } catch {}
  // Python
  if (await fileExists(path.join(repoPath, 'pytest.ini')) || await fileExists(path.join(repoPath, 'pyproject.toml'))) {
    return 'pytest'
  }
  return null
}
```

### Validation Fail → Chọn action

```typescript
async function handlePostCompletion(session: Session): Promise<void> {
  const epic = await getEpic(session.epic_id)
  const branches = JSON.parse(epic.git_branches)
  const repos = branches.map(b => ({
    ...b,
    path: getRepoPath(b.repo)
  }))

  // Run validation
  const validation = await validateBeforePush(session, repos)

  if (validation.passed) {
    // All checks pass → proceed to push + PR
    await pushAndCreatePR(session, epic, repos)
  } else {
    // Validation failed → DO NOT push, notify team
    log.warn(`Session ${session.id} failed pre-push validation`)

    await db.update(sessions)
      .set({ status: 'validation_failed' })
      .where(eq(sessions.id, session.id))

    // Emit validation results to UI
    socketManager.toSession(session.id, 'session:validation_failed', {
      session_id: session.id,
      checks: validation.checks
    })
    socketManager.toProject(session.project_id, 'session:lifecycle', {
      session: { id: session.id, status: 'validation_failed', epic_id: epic.id },
      event: 'validation_failed'
    })

    // Notify session owner
    await notificationService.send(session.user_id, {
      type: 'validation_failed',
      title: `Agent output failed validation for Epic "${epic.title}"`,
      body: validation.checks.filter(c => c.status === 'fail').map(c => c.name).join(', '),
      link: `/projects/${session.project_id}/agents?session=${session.id}`
    })

    // PM can choose:
    // 1. "Fix & Retry" → resume session with validation errors as context
    // 2. "Force Push" → override validation, push anyway (TechLead only)
    // 3. "Cancel" → discard work, delete branch
  }
}
```

### UI: Validation Results

```
┌──────────────────────────────────────────────────────────────┐
│ ⚠ Validation Failed — 2 checks did not pass                 │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ backend: has commits (3 commits)                         │
│  ❌ backend: tests (2 failing)                               │
│     > FAIL src/middleware/rate-limit.test.ts                 │
│     > Expected status 429, received 200                      │
│  ✅ backend: build                                           │
│  ✅ backend: typecheck                                       │
│  ✅ frontend: has commits (1 commit)                         │
│  ✅ frontend: tests                                          │
│  ✅ frontend: build                                          │
│                                                              │
│  [🔧 Fix & Retry]   [⚡ Force Push (TechLead)]   [✗ Cancel] │
└──────────────────────────────────────────────────────────────┘
```

**"Fix & Retry"** resumes the agent session with validation errors injected:

```typescript
async function retryWithValidationErrors(sessionId: string, validation: ValidationResult): Promise<void> {
  const failedChecks = validation.checks.filter(c => c.status === 'fail')

  const fixPrompt = `
Your previous work failed pre-push validation. Fix these issues:

${failedChecks.map(c => `### ${c.name}\n${c.output}`).join('\n\n')}

Fix all failing checks, then confirm "Work complete".
Do NOT push — the workspace handles pushing.
`
  await resumeSession(sessionId, fixPrompt)
}
```

---

## Phase 10: Push + Auto PR

Chỉ chạy khi Phase 9 validation PASSED.

```typescript
async function pushAndCreatePR(session: Session, epic: Epic, repos: any[]): Promise<void> {
  // Nếu multi-repo: push tất cả repos trước khi tạo PR
  // Đảm bảo nếu push 1 repo fail, không tạo PR cho repo kia (consistency)

  // Step 1: Push ALL repos (collect errors)
  const pushResults: Array<{ repo: string, success: boolean, error?: string }> = []
  for (const { repo, branch, path: repoPath } of repos) {
    try {
      await git(repoPath, ['push', '-u', 'origin', branch])
      pushResults.push({ repo, success: true })
    } catch (e: any) {
      pushResults.push({ repo, success: false, error: e.message })
    }
  }

  // Check: if any push failed in multi-repo, rollback all
  const failedPushes = pushResults.filter(r => !r.success)
  if (failedPushes.length > 0 && repos.length > 1) {
    log.error('Multi-repo push partially failed, rolling back')
    // Delete remote branches that were pushed
    for (const { repo, branch, path: repoPath } of repos) {
      if (pushResults.find(r => r.repo === repo)?.success) {
        try { await git(repoPath, ['push', 'origin', '--delete', branch]) } catch {}
      }
    }
    await markSessionFailed(session.id, `Push failed: ${failedPushes.map(f => `${f.repo}: ${f.error}`).join('; ')}`)
    return
  }

  // Step 2: Create PRs
  for (const { repo, branch } of repos) {
    const repoConfig = project.repos.find(r => r.name === repo)

    // 1. Push branch
    await gitService.run(repoConfig.path, ['push', '-u', 'origin', branch])

    // 2. Create PR
    const prUrl = await gitService.createPR(repoConfig.path, {
      title: `[Epic] ${epic.title}`,
      body: generatePRBody(epic, session),
      base: repoConfig.default_branch,
      head: branch
    })

    // 3. Update session with PR URL
    await db.update(sessions)
      .set({ pr_url: prUrl, pr_status: 'pending_review' })
      .where(eq(sessions.id, session.id))

    // 4. Update Epic status
    await db.update(epics)
      .set({ ui_status: 'in_review' })
      .where(eq(epics.id, epic.id))

    // 5. Emit PR event
    socketManager.toProject(session.project_id, 'pr:created', {
      pr: { url: prUrl, title: `[Epic] ${epic.title}`, epic_id: epic.id }
    })

    // 6. Spawn Code Review Agent
    await spawnReviewAgent(session, prUrl)

    // 7. Webhook notification
    await webhookService.send(session.project_id, 'pr_ready', {
      pr_url: prUrl, epic: epic.title, agent: session.agent_mail_name
    })
  }

  // 8. Index session in CASS
  // Vì không dùng --bare, claude ghi session log vào ~/.claude/
  // → cass index sẽ tìm thấy session mới
  try {
    await cassService.index()
  } catch (e) {
    // Fallback: nếu cass index fail (session log bị corrupt, v.v.),
    // export session_events từ DB thành JSONL file mà cass đọc được
    log.warn('CASS index failed, attempting fallback export', e)
    try {
      await cassService.exportSessionFromDb(session.id, session.claude_session_id)
      await cassService.index()
    } catch (e2) {
      log.warn('CASS fallback export also failed (non-critical)', e2)
    }
  }

  // 9. Record outcome in CM
  try {
    await cmClient.recordOutcome({
      session_id: session.claude_session_id,
      result: 'completed',
      summary: `Epic "${epic.title}" completed. PR created.`
    })
  } catch (e) {
    log.warn('CM outcome recording failed (non-critical)', e)
  }

  // 10. Agent Mail: notify thread
  try {
    await agentMailClient.sendMessage({
      thread_id: epic.bead_epic_id,
      subject: `[${epic.bead_epic_id}] PR ready for review`,
      body: `Agent ${session.agent_mail_name} completed work. PR: ${prUrl}`
    })
  } catch (e) {
    log.warn('Agent Mail notification failed (non-critical)', e)
  }
}
```

---

## Phase 10: Code Review Agent

```typescript
async function spawnReviewAgent(session: Session, prUrl: string): Promise<void> {
  // Get PR diff
  const diff = await gitService.getPRDiff(prUrl)

  const reviewPrompt = `
You are a Code Review Agent. Review this Pull Request and provide feedback.

## PR: ${prUrl}

## Diff:
${diff}

## Review Checklist:
1. Run UBS (Ultimate Bug Scanner) analysis
2. Check for security vulnerabilities (OWASP Top 10)
3. Verify coding standards compliance
4. Check for missing tests
5. Assess overall code quality

## Output Format:
Provide your review as structured feedback:
- List issues by severity (HIGH/MEDIUM/LOW)
- Include file path and line number for each issue
- Suggest specific fixes
- Give overall verdict: APPROVE or CHANGES_REQUESTED
`

  // Spawn as a separate session (not linked to Epic queue)
  const reviewSession = await createSession({
    project_id: session.project_id,
    epic_id: session.epic_id,
    user_id: 'system', // system-initiated
    model: 'sonnet',   // reviews use sonnet (faster, cheaper)
    prompt: reviewPrompt
  })

  await spawnAgent(reviewSession, reviewPrompt)
}
```

---

## Phase 11: Feedback Loop

Khi human comments trên PR → trigger agent fix:

```typescript
async function handleHumanFeedback(
  sessionId: string,
  comments: ReviewComment[]
): Promise<void> {
  const session = await getSession(sessionId)

  const fixPrompt = `
The reviewer has requested changes on your PR.

## Review Comments:
${comments.map(c => `
### ${c.file}:${c.line}
${c.body}
`).join('\n')}

## Instructions:
1. Address each comment
2. Fix the code
3. Commit with message referencing the feedback
4. Push the branch
`

  // Resume the original session
  await resumeSession(session, fixPrompt)
}
```

---

## Phase 12: Merge

```typescript
async function mergeEpic(sessionId: string, strategy: 'squash' = 'squash'): Promise<void> {
  const session = await getSession(sessionId)
  const epic = await getEpic(session.epic_id)

  // 1. Merge PR
  await gitService.mergePR(session.pr_url, { strategy: 'squash' })

  // 2. Pull main mới (vì vừa merge PR vào main trên remote)
  const branches = JSON.parse(epic.git_branches)
  for (const { repo } of branches) {
    const repoConfig = project.repos.find(r => r.name === repo)
    await gitService.run(repoConfig.path, ['checkout', repoConfig.default_branch])
    await gitService.run(repoConfig.path, ['pull', 'origin', repoConfig.default_branch])
  }

  // 3. Close Epic bead
  await beadsService.close(epic.bead_epic_id, `Merged PR. Session: ${session.id}`, 'system')

  // 4. Sync beads → export to .beads/issues.jsonl
  await beadsService.syncExport()

  // 5. CRITICAL: Commit và push .beads/ changes lên main
  // Không làm bước này → team devs pull code vẫn thấy Epic "In Progress"
  const beadsRoot = project.beads_root
  await gitService.run(beadsRoot, ['add', '.beads/'])
  await gitService.run(beadsRoot, [
    'commit', '-m', `chore: update beads state — close Epic ${epic.bead_epic_id}`
  ])
  await gitService.run(beadsRoot, ['push', 'origin', 'main'])

  // 6. Update Epic status
  await db.update(epics)
    .set({ ui_status: 'done' })
    .where(eq(epics.id, epic.id))

  // 7. Update session PR status
  await db.update(sessions)
    .set({ pr_status: 'merged' })
    .where(eq(sessions.id, sessionId))

  // 8. Cleanup epic branches
  for (const { repo, branch } of branches) {
    const repoConfig = project.repos.find(r => r.name === repo)
    await gitService.run(repoConfig.path, ['push', 'origin', '--delete', branch])
    await gitService.run(repoConfig.path, ['branch', '-D', branch])
  }

  // 9. Emit events
  socketManager.toProject(session.project_id, 'pr:event', {
    pr: { url: session.pr_url, status: 'merged', epic_id: epic.id }
  })
  socketManager.toProject(session.project_id, 'epic:updated', {
    epic: { id: epic.id, ui_status: 'done' },
    trigger: 'system'
  })

  // 10. Webhook
  await webhookService.send(session.project_id, 'pr_merged', {
    pr_url: session.pr_url, epic: epic.title
  })

  // 11. Activity log
  await logActivity(session.project_id, null, 'pr_merged', {
    pr_url: session.pr_url, epic_id: epic.id, session_id: sessionId
  })
}
```

---

## Queue Management

```typescript
class AgentQueue {
  // Check if we can spawn
  async canSpawn(projectId: string): Promise<boolean> {
    const project = await getProject(projectId)
    const runningCount = await db.select({ count: count() })
      .from(sessions)
      .where(and(
        eq(sessions.project_id, projectId),
        inArray(sessions.status, ['running', 'waiting_input'])
      ))
    return runningCount[0].count < project.max_concurrent_agents
  }

  // Add to queue
  async enqueue(item: QueueItem): Promise<number> {
    const position = await getNextPosition(item.project_id)
    await db.insert(agentQueue).values({ ...item, position, status: 'queued' })
    socketManager.toProject(item.project_id, 'queue:updated', await getQueueState(item.project_id))
    return position
  }

  // Process queue after a session completes
  async processQueue(projectId: string): Promise<void> {
    if (!await this.canSpawn(projectId)) return

    // Pick highest priority, earliest queued
    const next = await db.select()
      .from(agentQueue)
      .where(and(
        eq(agentQueue.project_id, projectId),
        eq(agentQueue.status, 'queued')
      ))
      .orderBy(asc(agentQueue.priority), asc(agentQueue.position))
      .limit(1)

    if (next.length === 0) return

    // Mark as picked
    await db.update(agentQueue)
      .set({ status: 'picked', picked_at: Math.floor(Date.now() / 1000) })
      .where(eq(agentQueue.id, next[0].id))

    // Create and spawn session
    const session = await createSession({
      project_id: projectId,
      epic_id: next[0].epic_id,
      user_id: next[0].user_id,
      model: next[0].model,
      prompt: next[0].prompt
    })

    await startSession(session)

    // Update queue state
    socketManager.toProject(projectId, 'queue:updated', await getQueueState(projectId))
  }
}
```
