# Agent Lifecycle & Execution Engine — claude-team-ws

## Overview

Agent lifecycle manages the entire lifecycle of a Claude Code session, from when the PM clicks "Start" to when the PR is merged.

```
Trigger → Scope Gate → Git Branch → Context Build → Spawn → Stream → Complete → PR → Review → Merge
```

---

## Crash Recovery (Server Restart)

When the Express server crashes or restarts (PM2 auto-restart, deploy update), active agent sessions need to be handled. The Agent SDK handles process lifecycle internally — cancellation is done via `abortController.abort()` rather than PID-based process management.

### On Startup: Recovery Sequence

```typescript
async function recoverOrphanedSessions(): Promise<void> {
  // 1. Find sessions marked as 'running' or 'waiting_input' in DB
  const orphaned = await db.select()
    .from(sessions)
    .where(inArray(sessions.status, ['running', 'waiting_input']))

  for (const session of orphaned) {
    // 2. The Agent SDK manages process lifecycle internally.
    //    On server restart, the AbortController reference is lost.
    //    Cancel via abortController.abort() is only possible for sessions
    //    started in the current server process.

    if (session.claude_session_id) {
      // 3a. Session has a claude_session_id — try to recover events from session log
      log.info(`Recovering session ${session.id} (claude session: ${session.claude_session_id})`)

      await db.update(sessions)
        .set({ status: 'detached' })
        .where(eq(sessions.id, session.id))

      // Attempt event recovery from session log file
      await handleDetachedSessionExit(session.id)
    } else {
      // 3b. No session ID — mark as failed
      log.warn(`Session ${session.id} has no claude_session_id`)
      await markSessionFailed(session.id, 'Server restarted before session ID recorded')

      await logActivity(session.project_id, null, 'session_crash_recovered', {
        session_id: session.id,
        recommendation: 'Resume session manually if needed'
      })
    }
  }

  // 4. Process queue — in case slots opened up
  const projectIds = [...new Set(orphaned.map(s => s.project_id))]
  for (const projectId of projectIds) {
    await agentQueue.processQueue(projectId)
  }
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

// Since we do NOT use --bare, claude writes session logs to ~/.claude/projects/<hash>/sessions/
// Session ID is known → read log file to recover missed events
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
| **AbortController reference lost on restart** | Cannot cancel sessions started by previous server process | Recover from session log file; sessions complete naturally |
| **Cannot resume SDK streaming** | Lose real-time streaming after server restart | Recover events from session log file |
| **Session log may be incomplete** | If agent crashes mid-session, log file may also be corrupt | Fallback: check git branch commits |

**Recovery priority chain** (try from top to bottom):

```
1. Session log file (~/.claude/.../sessions/<id>.jsonl)
   → Best source: contains all events including result
   → Since we don't use --bare, claude WRITES session logs

2. Git branch state
   → Fallback: check branchHasNewCommits()
   → Tells whether the agent did anything, but loses detail

3. Mark as failed
   → Last resort: no evidence of what the agent did
   → User can resume the session manually
```

**UI behavior for detached sessions:**

```
┌────────────────────────────────────────────────────────────┐
│ ⚠ DETACHED — Server restarted while agent was running      │
│                                                            │
│ BlueLake • Rate Limiting • session still active             │
│                                                            │
│ Stream unavailable (server restarted).                     │
│ Agent session may still be active. Recovering events...    │
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
│ ⏳ Recovering events from session log...                     │
│                                              [Cancel]      │
└────────────────────────────────────────────────────────────┘
```

When PID exit is detected → recovered events are supplemented, status updated, postCompletion triggered. UI transitions to normal state.

---

## Phase 1: Trigger & Validation

### User clicks "Start Agent Session" on Epic card

```
POST /api/projects/:projectId/sessions
{ "epic_id": "...", "model": "sonnet" }
```

### Server-side validation:

1. **Permission check**: User must be PM, Dev, or TechLead
2. **Epic status check**: ui_status must be `ready` (not `blocked` or already `in_progress`)
3. **Concurrency check**: Count running sessions for project
   - If `running_count >= max_concurrent_agents` → add to queue
   - Return `{ status: "queued", position: N }`

---

## Phase 2: Scope Gate

If the Epic has not been analyzed yet:

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

**If `recommendation = 'split'`:**
- Emit `session:scope_gate` via Socket.IO → UI shows split proposal dialog
- PM review/edit → confirm → server creates child beads via `br create`
- Then continue to spawn

**If `recommendation = 'proceed'`:**
- Continue to spawn immediately

---

## Phase 3: Git Branch Isolation

```typescript
async function createEpicBranch(epic: Epic, repos: Repo[]): Promise<string[]> {
  const branches: string[] = []
  const slug = slugify(epic.title) // e.g.: "rate-limiting"

  for (const repo of epic.targetRepos) {
    const branchName = `epic/${slug}`

    // CRITICAL: Pull latest main before creating branch
    // Avoid basing on stale code → merge conflicts when creating PR
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

**Cleanup on failure:** If spawn fails, delete branch:
```bash
git checkout main && git branch -D epic/<slug>
```

---

## Phase 4: Context Building

Gather context from **6 sources** before spawning the agent. The agent will explore further using Read/Glob/Grep during execution, but good initial context = fewer wasted turns = faster + cheaper.

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
  // Help agent understand structure BEFORE it explores on its own
  const codebaseSection = await buildCodebaseSnapshot(targetRepos, epicBead)

  // ── 3. Dependency graph (from bv) ──────────────────────
  // Agent knows which beads must be completed first, which ones are blocked downstream
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

**Why this is needed:** The agent will Read/Glob on its own during execution, but each tool call costs 1 turn. Pre-injecting the file tree + key files helps the agent understand the codebase on turn 1 instead of turn 5.

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

**Token budget:** Codebase snapshot can be large. Limits:
- File tree: max 3000 chars (~100 lines)
- Config files: max 500 chars per file
- Relevant files: max 5 files × 50 lines
- CLAUDE.md: max 2000 chars
- **Total: ~8K-15K tokens** — worth it to save 5-10 turns of exploring

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

**Why hardcode in the prompt:** Claude Code CAN run tests — but nothing ENFORCES that it must. The agent could finish coding, commit, and push without testing. Guardrails in the prompt = soft enforcement.

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

**Final note on guardrails:** This is soft enforcement via prompt. The agent CAN ignore it. Hard enforcement is in Phase 9 (post-completion validation) — see below.

---

## Phase 5: Agent Spawn

The Agent SDK handles process spawning, NDJSON parsing, and typed message delivery internally. Instead of raw `spawn('claude', args)`, we use the `query()` function from `@anthropic-ai/claude-agent-sdk`.

Cancellation uses `AbortController` instead of PID tracking — call `abortController.abort()` to stop a running session.

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk'

async function spawnAgent(session: Session, prompt: string): Promise<void> {
  const claudeSessionId = crypto.randomUUID()

  const agentQuery = query({
    prompt,
    options: {
      model: session.model,
      cwd: project.repos[0].path,
      additionalDirectories: [project.repos[0].path],
      permissionMode: project.permissionMode,
      abortController: session.abortController,
      allowDangerouslySkipPermissions: project.permissionMode === 'bypassPermissions',
      settingSources: ['user', 'project'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      canUseTool: async (toolName, input) => {
        if (toolName === 'AskUserQuestion') {
          return await handleAskUserQuestionPermission(session, input)
        }
        // Auto-approve all other tools
        return { behavior: 'allow' as const, updatedInput: input }
      },
    },
  })

  // Record session start
  await db.update(sessions)
    .set({
      claude_session_id: claudeSessionId,
      status: 'running',
      started_at: Math.floor(Date.now() / 1000)
    })
    .where(eq(sessions.id, session.id))

  // Iterate over SDK messages (replaces readline NDJSON parsing)
  for await (const message of agentQuery) {
    if (session.abortController.signal.aborted) break
    await handleSDKMessage(session.id, message)
  }
}
```

---

## Agent SDK Reference

### Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

### Key Types

The SDK exports typed message types for the async iterator returned by `query()`:

| Type | Description |
|---|---|
| `SDKAssistantMessage` | `message.type === 'assistant'` — model response with `content[]` blocks (text, tool_use) |
| `SDKUserMessage` | `message.type === 'user'` — tool results with `content[]` blocks (tool_result) |
| `SDKResultMessage` | `message.type === 'result'` — final result with `total_cost_usd`, `num_turns`, `usage`, `modelUsage` |
| `SDKSystemMessage` | `message.type === 'system'` — system events; `subtype === 'init'` carries `session_id`, `tools`, `slash_commands`, `agents`, `skills` |

### Session Resume

To resume a previous session, pass the session ID (UUID from `system.init` message) in options:

```typescript
const resumed = query({
  prompt: 'Continue where you left off',
  options: {
    ...baseOptions,
    resume: previousSessionId, // UUID from system.init event
  },
})
```

### Enriching Capabilities

After creating a query, inspect available capabilities:

```typescript
const agentQuery = query({ prompt, options })
const commands = agentQuery.supportedCommands()  // Available slash commands
const agents = agentQuery.supportedAgents()      // Available sub-agents
```

### File Attachments

The SDK does not support direct file attachments in the prompt. Instead, save files to disk and reference the path in the prompt — the agent will use the `Read` tool to access them.

### `canUseTool` Return Format

The `updatedInput` field is **REQUIRED** (not optional) — omitting it causes a ZodError. Always include it:

```typescript
// CORRECT
return { behavior: 'allow' as const, updatedInput: input }

// WRONG — causes ZodError
return { behavior: 'allow' as const }
```

### Test Cleanup

After integration tests, delete session files to avoid accumulation:

```bash
rm -f ~/.claude/projects/<hash>/sessions/<session-id>.jsonl
```

---

## Phase 6: Stream Processing (SDK Message Handling)

The Agent SDK delivers typed messages instead of raw NDJSON lines. No need for `classifyEvent` or `readline` parsing — the SDK handles this internally.

```typescript
async function handleSDKMessage(sessionId: string, message: SDKMessage): Promise<void> {
  if (message.type === 'assistant') {
    // message.message.content[] has {type: "text"} and {type: "tool_use"} blocks
    for (const block of message.message.content) {
      if (block.type === 'text') {
        await storeAndBroadcast(sessionId, 'assistant', block.text)
      } else if (block.type === 'tool_use') {
        await storeAndBroadcast(sessionId, 'tool_use', { name: block.name, input: block.input })
      }
    }
    // Extract context window usage from message.message.usage
    const usage = message.message.usage
    if (usage) {
      // usage.input_tokens, usage.cache_creation_input_tokens, usage.cache_read_input_tokens
      const usedPct = (usage.input_tokens + usage.cache_creation_input_tokens + usage.cache_read_input_tokens) / 200000 * 100
      await storeAndBroadcast(sessionId, 'usage', { percent: usedPct, raw: usage })
    }
  } else if (message.type === 'user') {
    // Tool results: message.message.content[{type: "tool_result", content, is_error}]
    for (const block of message.message.content) {
      if (block.type === 'tool_result') {
        await storeAndBroadcast(sessionId, 'tool_result', {
          tool_use_id: block.tool_use_id,
          content: block.content,
          is_error: block.is_error
        })
      }
    }
  } else if (message.type === 'result') {
    // Final result: message.total_cost_usd, message.num_turns, message.usage, message.modelUsage
    await storeAndBroadcast(sessionId, 'result', {
      cost_usd: message.total_cost_usd,
      num_turns: message.num_turns,
      usage: message.usage,
      model_usage: message.modelUsage
    })
    await handleAgentExit(sessionId, 0, null)
  } else if (message.type === 'system' && message.subtype === 'init') {
    // Session initialized: message.session_id, message.tools, message.slash_commands, message.agents, message.skills
    await storeAndBroadcast(sessionId, 'system_init', {
      claude_session_id: message.session_id,
      tools: message.tools,
      agents: message.agents,
      skills: message.skills
    })
  }
}

async function storeAndBroadcast(sessionId: string, eventType: string, data: unknown): Promise<void> {
  const stored = await db.insert(sessionEvents).values({
    session_id: sessionId,
    event_type: eventType,
    data: JSON.stringify(data),
    created_at: Math.floor(Date.now() / 1000)
  }).returning()

  socketManager.toSession(sessionId, 'session:event', {
    session_id: sessionId,
    event_id: stored[0].id,
    event_type: eventType,
    data,
    timestamp: Date.now()
  })
}
```

---

## Phase 7: AskUserQuestion Handling

With the Agent SDK, AskUserQuestion is handled via the `canUseTool` callback in `query()` options (see Phase 5). The callback holds the SDK's async iterator until the user answers, then returns the answer as part of `updatedInput`.

> **WARNING**: Do NOT return `{ behavior: 'deny', message: 'User answered: X' }` from `canUseTool` for AskUserQuestion. This causes the agent to see the answer as a tool error, retry AskUserQuestion, and trigger `InputValidationError: The required parameter questions[0].options[3].description is missing`. Always use `{ behavior: 'allow', updatedInput: { ...input, answers } }`.

### AskUserQuestion Input Format

```typescript
// CRITICAL: AskUserQuestion input format is:
// { questions: [{ question: string, header: string, options: [{ label, description }], multiSelect: boolean }] }
// NOT a flat { question: string, options: string[] }
```

### canUseTool Handler (3 modes, configurable per project)

```typescript
async function handleAskUserQuestionPermission(session: Session, input: unknown) {
  const questions = (input as any).questions as any[]
  const firstQ = questions?.[0]
  const question = {
    text: firstQ?.question ?? '',
    options: firstQ?.options?.map((o: any) => o.label ?? o.description ?? String(o)) ?? [],
    context: firstQ?.header ?? '',
  }

  const project = await getProject(session.project_id)
  const mode = project.ask_question_mode // 'pause' | 'auto' | 'hybrid'

  let userAnswer: string

  if (mode === 'auto') {
    // Always auto-answer using CM rules + CASS
    userAnswer = await generateAutoAnswer(question, session)

  } else if (mode === 'hybrid') {
    const risk = assessQuestionRisk(question)
    if (risk === 'low') {
      // Auto-answer with timeout — give human 30s to override
      const autoAnswer = await generateAutoAnswer(question, session)
      userAnswer = await pauseAndAskWithTimeout(session, question, autoAnswer, 30)
    } else {
      userAnswer = await pauseAndAsk(session, question)
    }

  } else {
    // 'pause' mode — always pause and ask human
    userAnswer = await pauseAndAsk(session, question)
  }

  // CORRECT: Allow with pre-filled answers
  // DO NOT use { behavior: 'deny' } — causes retry loops and validation errors
  return {
    behavior: 'allow' as const,
    updatedInput: {
      ...input,
      answers: { [firstQ?.question ?? '']: userAnswer },
    },
  }
}

async function pauseAndAsk(session: Session, question: Question): Promise<string> {
  // Set session to waiting_input, emit to UI
  session.status = 'waiting_input'
  await db.update(sessions)
    .set({ status: 'waiting_input' })
    .where(eq(sessions.id, session.id))

  socketManager.toSession(session.id, 'session:question', { question })

  await notificationService.send(session.user_id, {
    type: 'question_waiting',
    title: `Agent needs input: ${question.text.slice(0, 50)}...`,
    link: `/projects/${session.project_id}/agents?session=${session.id}`
  })

  // Hold the promise until user answers via the UI
  const userAnswer = await new Promise<string>(resolve => {
    session.pendingAnswer = resolve
  })

  // Restore running status
  await db.update(sessions)
    .set({ status: 'running' })
    .where(eq(sessions.id, session.id))

  return userAnswer
}

async function pauseAndAskWithTimeout(
  session: Session,
  question: Question,
  autoAnswer: string,
  timeoutSeconds: number
): Promise<string> {
  return new Promise<string>(resolve => {
    // Set up human override
    session.pendingAnswer = (humanAnswer: string) => {
      clearTimeout(timer)
      resolve(humanAnswer)
    }

    // Emit to UI with auto-answer and countdown
    socketManager.toSession(session.id, 'session:question', {
      question,
      auto_answer: autoAnswer,
      timeout_seconds: timeoutSeconds
    })

    // Auto-accept after timeout
    const timer = setTimeout(() => {
      session.pendingAnswer = undefined
      resolve(autoAnswer)
    }, timeoutSeconds * 1000)
  })
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
  if (signal === 'aborted') {
    // Session was cancelled via abortController.abort()
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

Guardrails in the prompt are soft enforcement — the agent can ignore them. Phase 9 runs validation server-side BEFORE pushing the branch and creating a PR. If it fails → NO push, NO PR creation.

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

### Validation Fail → Choose action

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

Only runs when Phase 9 validation PASSED.

```typescript
async function pushAndCreatePR(session: Session, epic: Epic, repos: any[]): Promise<void> {
  // If multi-repo: push all repos before creating PRs
  // Ensure if pushing 1 repo fails, no PR is created for the other (consistency)

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
  // Since we don't use --bare, claude writes session logs to ~/.claude/
  // → cass index will find the new session
  try {
    await cassService.index()
  } catch (e) {
    // Fallback: if cass index fails (session log is corrupt, etc.),
    // export session_events from DB as a JSONL file that cass can read
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

When a human comments on the PR → trigger agent fix:

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

  // 2. Pull updated main (since we just merged the PR into main on remote)
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

  // 5. CRITICAL: Commit and push .beads/ changes to main
  // Skipping this step → team devs pulling code still see Epic as "In Progress"
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
