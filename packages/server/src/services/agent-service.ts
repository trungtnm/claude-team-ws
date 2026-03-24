import { query } from '@anthropic-ai/claude-agent-sdk'
import { eq, inArray, and, asc, count } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { readFile } from 'fs/promises'
import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { db, sqlite } from '../db/index.js'
import { sessions, sessionEvents, epics, projects, agentQueue } from '../db/schema.js'
import { emitToProject, emitToSession } from './socket-manager.js'
import { BeadsService } from './beads-service.js'
import { cmClient } from './cm-client.js'
import { cassService } from './cass-service.js'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ManagedSession {
  sessionId: string
  abortController: AbortController
  claudeSessionId: string | null
  pendingAnswer: ((answer: string) => void) | null
}

export interface SpawnOptions {
  projectId: string
  epicId?: string
  userId: string
  prompt: string
  model?: string
}

// ─── AgentService ────────────────────────────────────────────────────────────

class AgentService {
  private managed = new Map<string, ManagedSession>()

  // ── Spawn a new agent session ──────────────────────────────────────────

  async spawn(opts: SpawnOptions): Promise<{ id: string; status: string; position?: number }> {
    const { projectId, epicId, userId, prompt, model = 'sonnet' } = opts

    // Check concurrency limit + create session in a single transaction (prevents TOCTOU race)
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) throw new Error(`AgentService.spawn: project ${projectId} not found`)

    const sessionId = nanoid(12)
    const now = Math.floor(Date.now() / 1000)

    const txResult = sqlite.transaction(() => {
      const runningCount = db
        .select({ count: count() })
        .from(sessions)
        .where(and(eq(sessions.project_id, projectId), inArray(sessions.status, ['running', 'waiting_input'])))
        .get()

      if ((runningCount?.count ?? 0) >= project.max_concurrent_agents) {
        return { queued: true as const }
      }

      db.insert(sessions).values({
        id: sessionId,
        project_id: projectId,
        epic_id: epicId ?? null,
        user_id: userId,
        model,
        status: 'running',
        prompt,
        started_at: now,
      }).run()

      if (epicId) {
        db.update(epics)
          .set({ ui_status: 'in_progress', updated_at: now })
          .where(eq(epics.id, epicId))
          .run()
      }

      return { queued: false as const }
    })()

    if (txResult.queued) {
      if (!epicId) {
        throw new Error('AgentService.spawn: cannot queue ad-hoc session without epic_id (agent_queue.epic_id is NOT NULL)')
      }
      const position = await this.enqueue(projectId, epicId, userId, prompt, model)
      return { id: '', status: 'queued', position }
    }

    emitToProject(projectId, 'session:lifecycle', {
      sessionId,
      status: 'running',
      epicId,
      model,
    })

    // Build context and spawn agent in background
    this.runSession(sessionId, projectId, project.project_root, prompt, model, epicId).catch((err) => {
      this.handleError(sessionId, projectId, err)
    })

    return { id: sessionId, status: 'running' }
  }

  // ── Cancel a running session ───────────────────────────────────────────

  cancel(sessionId: string): boolean {
    const managed = this.managed.get(sessionId)
    if (!managed) return false

    managed.abortController.abort()
    const now = Math.floor(Date.now() / 1000)

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return false

    db.update(sessions)
      .set({ status: 'cancelled', finished_at: now })
      .where(eq(sessions.id, sessionId))
      .run()

    this.storeEvent(sessionId, 'system', { type: 'system', content: 'Session cancelled by user.' })
    emitToProject(session.project_id, 'session:lifecycle', { sessionId, status: 'cancelled' })
    emitToSession(sessionId, 'session:lifecycle', { sessionId, status: 'cancelled' })

    this.managed.delete(sessionId)
    this.processQueue(session.project_id)
    return true
  }

  // ── Answer a pending AskUserQuestion ───────────────────────────────────

  answer(sessionId: string, answerText: string): boolean {
    const managed = this.managed.get(sessionId)
    if (!managed?.pendingAnswer) return false

    managed.pendingAnswer(answerText)
    managed.pendingAnswer = null

    db.update(sessions)
      .set({ status: 'running' })
      .where(eq(sessions.id, sessionId))
      .run()

    this.storeEvent(sessionId, 'system', { type: 'user_message', content: answerText })

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (session) {
      emitToProject(session.project_id, 'session:lifecycle', { sessionId, status: 'running' })
      emitToSession(sessionId, 'session:lifecycle', { sessionId, status: 'running' })
    }
    return true
  }

  // ── Resume a session with a new message ────────────────────────────────

  async resume(sessionId: string, message: string): Promise<boolean> {
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session || !session.claude_session_id) return false
    if (session.status !== 'completed' && session.status !== 'failed' && session.status !== 'cancelled') return false

    const project = db.select().from(projects).where(eq(projects.id, session.project_id)).get()
    if (!project) return false

    db.update(sessions)
      .set({ status: 'running', finished_at: null })
      .where(eq(sessions.id, sessionId))
      .run()

    this.storeEvent(sessionId, 'system', { type: 'user_message', content: message })
    emitToProject(session.project_id, 'session:lifecycle', { sessionId, status: 'running' })

    this.runSession(sessionId, session.project_id, project.project_root, message, session.model, session.epic_id ?? undefined, session.claude_session_id).catch((err) => {
      this.handleError(sessionId, session.project_id, err)
    })

    return true
  }

  // ── Crash recovery on startup ──────────────────────────────────────────

  async recoverOrphanedSessions(): Promise<number> {
    const orphaned = db.select()
      .from(sessions)
      .where(inArray(sessions.status, ['running', 'waiting_input']))
      .all()

    if (orphaned.length === 0) return 0

    console.log(`[AgentService] Recovering ${orphaned.length} orphaned sessions...`)

    for (const session of orphaned) {
      if (session.claude_session_id) {
        db.update(sessions)
          .set({ status: 'detached' })
          .where(eq(sessions.id, session.id))
          .run()

        // Try to recover events from session log
        const recovered = await this.recoverEventsFromLog(session.id, session.claude_session_id)
        if (recovered > 0) {
          console.log(`[AgentService] Recovered ${recovered} events for session ${session.id}`)
        }

        // Check if result event was recovered
        const resultEvents = db.select()
          .from(sessionEvents)
          .where(and(eq(sessionEvents.session_id, session.id), eq(sessionEvents.event_type, 'result')))
          .all()

        if (resultEvents.length > 0) {
          db.update(sessions)
            .set({ status: 'completed', finished_at: Math.floor(Date.now() / 1000) })
            .where(eq(sessions.id, session.id))
            .run()
        } else {
          db.update(sessions)
            .set({ status: 'failed', finished_at: Math.floor(Date.now() / 1000) })
            .where(eq(sessions.id, session.id))
            .run()
        }
      } else {
        db.update(sessions)
          .set({ status: 'failed', finished_at: Math.floor(Date.now() / 1000) })
          .where(eq(sessions.id, session.id))
          .run()
      }
    }

    // Process queues for affected projects
    const projectIds = [...new Set(orphaned.map((s) => s.project_id))]
    for (const pid of projectIds) {
      this.processQueue(pid)
    }

    return orphaned.length
  }

  // ── Queue management ───────────────────────────────────────────────────

  private async enqueue(projectId: string, epicId: string, userId: string, prompt: string, model: string): Promise<number> {
    const maxPos = db.select({ count: count() })
      .from(agentQueue)
      .where(and(eq(agentQueue.project_id, projectId), eq(agentQueue.status, 'queued')))
      .get()

    const position = (maxPos?.count ?? 0) + 1
    const id = nanoid(12)

    db.insert(agentQueue).values({
      id,
      project_id: projectId,
      epic_id: epicId,
      user_id: userId,
      prompt,
      model,
      position,
    }).run()

    emitToProject(projectId, 'queue:updated', { action: 'enqueued', position })
    return position
  }

  private processQueue(projectId: string): void {
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) return

    const runningCount = db
      .select({ count: count() })
      .from(sessions)
      .where(and(eq(sessions.project_id, projectId), inArray(sessions.status, ['running', 'waiting_input'])))
      .get()

    const available = project.max_concurrent_agents - (runningCount?.count ?? 0)
    if (available <= 0) return

    const queued = db.select()
      .from(agentQueue)
      .where(and(eq(agentQueue.project_id, projectId), eq(agentQueue.status, 'queued')))
      .orderBy(asc(agentQueue.priority), asc(agentQueue.position))
      .limit(available)
      .all()

    for (const item of queued) {
      db.update(agentQueue)
        .set({ status: 'picked', picked_at: Math.floor(Date.now() / 1000) })
        .where(eq(agentQueue.id, item.id))
        .run()

      this.spawn({
        projectId: item.project_id,
        epicId: item.epic_id,
        userId: item.user_id,
        prompt: item.prompt,
        model: item.model,
      }).catch((err) => {
        console.error(`[AgentService] Failed to spawn queued session:`, err)
      })
    }
  }

  // ── Agent execution ────────────────────────────────────────────────────

  private async runSession(
    sessionId: string,
    projectId: string,
    projectRoot: string,
    prompt: string,
    model: string,
    epicId?: string,
    resumeSessionId?: string,
  ): Promise<void> {
    const abortController = new AbortController()
    const managed: ManagedSession = {
      sessionId,
      abortController,
      claudeSessionId: resumeSessionId ?? null,
      pendingAnswer: null,
    }
    this.managed.set(sessionId, managed)

    // Build enriched prompt with context (only for new sessions, not resumes)
    let enrichedPrompt = prompt
    if (!resumeSessionId && epicId) {
      enrichedPrompt = await this.buildContext(prompt, projectRoot, epicId)
    }

    this.storeEvent(sessionId, 'system', {
      type: 'system',
      content: `Session started. Model: ${model}. Dir: ${projectRoot}.`,
    })

    const options: Record<string, unknown> = {
      model,
      cwd: projectRoot,
      permissionMode: 'bypassPermissions',
      abortController,
      allowDangerouslySkipPermissions: true,
      canUseTool: async (toolName: string, input: Record<string, unknown>) => {
        if (toolName === 'AskUserQuestion') {
          return this.handleAskUserQuestion(managed, sessionId, projectId, input)
        }
        return { behavior: 'allow' as const, updatedInput: input }
      },
    }

    if (resumeSessionId) {
      options.resume = resumeSessionId
    }

    try {
      const agentQuery = query({ prompt: enrichedPrompt, options })

      for await (const message of agentQuery) {
        if (abortController.signal.aborted) break
        this.handleMessage(managed, sessionId, projectId, message)
      }

      // Agent finished — mark as idle (can be resumed)
      const currentSession = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (currentSession?.status === 'running') {
        db.update(sessions)
          .set({ status: 'completed', finished_at: Math.floor(Date.now() / 1000) })
          .where(eq(sessions.id, sessionId))
          .run()

        emitToProject(projectId, 'session:lifecycle', { sessionId, status: 'completed' })
        emitToSession(sessionId, 'session:lifecycle', { sessionId, status: 'completed' })
      }
    } catch (err) {
      const errStr = String(err)
      if (errStr.includes('aborted') || errStr.includes('AbortError')) return
      throw err
    } finally {
      this.managed.delete(sessionId)
      this.processQueue(projectId)
    }
  }

  // ── Context building ───────────────────────────────────────────────────

  private async buildContext(prompt: string, projectRoot: string, epicId: string): Promise<string> {
    const parts: string[] = []

    try {
      // 1. Epic details from Beads
      const epic = db.select().from(epics).where(eq(epics.id, epicId)).get()
      if (epic?.bead_epic_id) {
        const beadsService = new BeadsService(projectRoot)
        const epicBead = await beadsService.show(epic.bead_epic_id)
        parts.push(`## Epic: ${epicBead.title}`)
      }
    } catch {
      // Non-critical — continue without epic context
    }

    try {
      // 2. CM rules
      const cmContext = await cmClient.getContext(prompt, 10)
      if (cmContext.relevantBullets.length > 0) {
        const rules = cmContext.relevantBullets.map((b) => `- [${b.id}] ${b.content}`).join('\n')
        parts.push(`## Team Rules\n${rules}`)
      }
      if (cmContext.antiPatterns.length > 0) {
        const patterns = cmContext.antiPatterns.map((p) => `- AVOID: ${p.content} (${p.reason})`).join('\n')
        parts.push(`## Anti-Patterns\n${patterns}`)
      }
    } catch {
      // CM might be unavailable
    }

    try {
      // 3. CASS past learnings
      const learnings = await cassService.search(prompt, 30, 3)
      if (learnings.length > 0) {
        const excerpts = learnings.map((l) => `- ${l.excerpt}`).join('\n')
        parts.push(`## Past Learnings\n${excerpts}`)
      }
    } catch {
      // CASS might be unavailable
    }

    if (parts.length === 0) return prompt

    return `${parts.join('\n\n')}\n\n---\n\n## Task\n${prompt}`
  }

  // ── AskUserQuestion handling ───────────────────────────────────────────

  private async handleAskUserQuestion(
    managed: ManagedSession,
    sessionId: string,
    projectId: string,
    input: Record<string, unknown>,
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> }> {
    const questions = input.questions as Array<{ question?: string; header?: string; options?: unknown[] }> | undefined
    const firstQ = questions?.[0]

    const question = {
      text: firstQ?.question ?? '',
      options: Array.isArray(firstQ?.options)
        ? firstQ.options.map((o: unknown) => typeof o === 'string' ? o : String(o))
        : [],
      context: firstQ?.header ?? '',
    }

    db.update(sessions)
      .set({ status: 'waiting_input' })
      .where(eq(sessions.id, sessionId))
      .run()

    this.storeEvent(sessionId, 'tool_use', {
      type: 'tool_use',
      content: `AskUserQuestion: ${question.text}`,
      toolName: 'AskUserQuestion',
    })

    emitToSession(sessionId, 'session:question', { sessionId, question })
    emitToProject(projectId, 'session:lifecycle', { sessionId, status: 'waiting_input' })

    // Wait for user answer
    const userAnswer = await new Promise<string>((resolve) => {
      managed.pendingAnswer = resolve
    })

    const questionText = firstQ?.question ?? ''
    return {
      behavior: 'allow',
      updatedInput: {
        ...input,
        answers: { [questionText]: userAnswer },
      },
    }
  }

  // ── Message handling ───────────────────────────────────────────────────

  private handleMessage(managed: ManagedSession, sessionId: string, projectId: string, message: unknown): void {
    const msg = message as Record<string, unknown>
    const type = msg.type as string

    if (type === 'system') {
      const subtype = (msg as Record<string, unknown>).subtype as string | undefined
      if (subtype === 'init') {
        managed.claudeSessionId = (msg as Record<string, unknown>).session_id as string ?? null
        db.update(sessions)
          .set({ claude_session_id: managed.claudeSessionId })
          .where(eq(sessions.id, sessionId))
          .run()
      }
    } else if (type === 'assistant') {
      this.handleAssistantMessage(sessionId, projectId, msg)
    } else if (type === 'user') {
      this.handleUserMessage(sessionId, msg)
    } else if (type === 'result') {
      this.handleResultMessage(sessionId, projectId, msg)
    }
  }

  private handleAssistantMessage(sessionId: string, projectId: string, message: Record<string, unknown>): void {
    const msgContent = (message.message as Record<string, unknown>)?.content
    if (!Array.isArray(msgContent)) return

    for (const block of msgContent) {
      if (block.type === 'text' && block.text) {
        this.storeEvent(sessionId, 'assistant', { type: 'assistant', content: block.text })
        emitToSession(sessionId, 'session:event', {
          sessionId,
          event: { type: 'assistant', content: block.text },
        })
      } else if (block.type === 'tool_use') {
        const toolName = block.name ?? 'unknown'
        this.storeEvent(sessionId, 'tool_use', {
          type: 'tool_use',
          content: `Using ${toolName}...`,
          toolName,
        })
        emitToSession(sessionId, 'session:event', {
          sessionId,
          event: { type: 'tool_use', content: `Using ${toolName}...`, toolName },
        })
      }
    }

    // Emit progress with context window data
    const usage = (message.message as Record<string, unknown>)?.usage as Record<string, number> | undefined
    if (usage) {
      emitToSession(sessionId, 'session:progress', {
        sessionId,
        contextWindow: {
          inputTokens: usage.input_tokens ?? 0,
          outputTokens: usage.output_tokens ?? 0,
          cacheCreation: usage.cache_creation_input_tokens ?? 0,
          cacheRead: usage.cache_read_input_tokens ?? 0,
        },
      })
    }
  }

  private handleUserMessage(sessionId: string, message: Record<string, unknown>): void {
    const msgContent = (message.message as Record<string, unknown>)?.content
    if (!Array.isArray(msgContent)) return

    for (const block of msgContent) {
      if (block.type === 'tool_result') {
        const resultText = Array.isArray(block.content)
          ? block.content.map((c: Record<string, unknown>) => c.text ?? '').join('\n')
          : typeof block.content === 'string'
            ? block.content
            : ''

        if (block.is_error) {
          this.storeEvent(sessionId, 'error', { type: 'error', content: String(resultText).slice(0, 1000) })
        }
      }
    }
  }

  private handleResultMessage(sessionId: string, projectId: string, message: Record<string, unknown>): void {
    const costUsd = (message.total_cost_usd as number) ?? 0
    const durationMs = (message.duration_ms as number) ?? 0
    const subtype = message.subtype as string

    const parts: string[] = []
    if (subtype === 'success') {
      parts.push((message.result as string) ?? 'Agent finished.')
    } else {
      parts.push(`Agent stopped: ${subtype}`)
    }
    if (costUsd > 0) parts.push(`Cost: $${costUsd.toFixed(4)}`)
    if (durationMs > 0) parts.push(`Duration: ${(durationMs / 1000).toFixed(1)}s`)

    this.storeEvent(sessionId, 'result', { type: 'result', content: parts.join(' | ') })
    emitToSession(sessionId, 'session:event', {
      sessionId,
      event: { type: 'result', content: parts.join(' | ') },
    })
  }

  // ── Event persistence ──────────────────────────────────────────────────

  private storeEvent(sessionId: string, eventType: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error', data: Record<string, unknown>): void {
    db.insert(sessionEvents).values({
      session_id: sessionId,
      event_type: eventType,
      data: JSON.stringify(data),
    }).run()
  }

  // ── Session log recovery ───────────────────────────────────────────────

  private async recoverEventsFromLog(sessionId: string, claudeSessionId: string): Promise<number> {
    try {
      const claudeDir = join(homedir(), '.claude', 'projects')
      if (!existsSync(claudeDir)) return 0

      let sessionFile: string | null = null
      for (const projectHash of readdirSync(claudeDir)) {
        const candidate = join(claudeDir, projectHash, 'sessions', `${claudeSessionId}.jsonl`)
        if (existsSync(candidate)) {
          sessionFile = candidate
          break
        }
      }
      if (!sessionFile) return 0

      const content = await readFile(sessionFile, 'utf-8')
      const lines = content.trim().split('\n').filter((l) => l.trim())

      // Count existing events
      const existing = db.select({ count: count() })
        .from(sessionEvents)
        .where(eq(sessionEvents.session_id, sessionId))
        .get()
      const skip = existing?.count ?? 0

      const newEvents = lines.slice(skip)
      let recovered = 0

      for (const line of newEvents) {
        try {
          const event = JSON.parse(line)
          const eventType = event.type ?? 'system'
          db.insert(sessionEvents).values({
            session_id: sessionId,
            event_type: eventType,
            data: line,
          }).run()
          recovered++
        } catch {
          // Skip malformed lines
        }
      }

      return recovered
    } catch (err) {
      console.warn(`[AgentService] Failed to recover events for ${sessionId}:`, err)
      return 0
    }
  }

  // ── Error handling ─────────────────────────────────────────────────────

  private handleError(sessionId: string, projectId: string, err: unknown): void {
    const errStr = String(err)
    if (errStr.includes('aborted') || errStr.includes('AbortError')) return

    console.error(`[AgentService] Session ${sessionId} error:`, err)

    db.update(sessions)
      .set({ status: 'failed', finished_at: Math.floor(Date.now() / 1000) })
      .where(eq(sessions.id, sessionId))
      .run()

    this.storeEvent(sessionId, 'error', { type: 'error', content: errStr })
    emitToProject(projectId, 'session:lifecycle', { sessionId, status: 'failed' })
    emitToSession(sessionId, 'session:lifecycle', { sessionId, status: 'failed' })

    // NOTE: managed.delete and processQueue are handled by runSession's finally block.
    // Do NOT call them here to avoid double-execution.
  }
}

export const agentService = new AgentService()
