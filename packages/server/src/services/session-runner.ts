import { query } from '@anthropic-ai/claude-agent-sdk'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, sessionEvents, projects } from '../db/schema.js'
import { emitToProject, emitToSession, getIO } from './socket-manager.js'

// ─── Types ─────────────────────────────────────────────────────────────────

interface ManagedSession {
  sessionId: string
  projectId: string
  abortController: AbortController
  claudeSessionId: string | null
  pendingAnswer: ((answer: string) => void) | null
  eventCounter: number
}

// ─── Session Runner ────────────────────────────────────────────────────────

const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
}

class SessionRunner {
  private managed = new Map<string, ManagedSession>()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  start(): void {
    // Recover orphaned sessions from previous crash
    const now = Math.floor(Date.now() / 1000)
    const orphanedRunning = db
      .update(sessions)
      .set({ status: 'failed', finished_at: now })
      .where(eq(sessions.status, 'running'))
      .run()
    const orphanedWaiting = db
      .update(sessions)
      .set({ status: 'failed', finished_at: now })
      .where(eq(sessions.status, 'waiting_input'))
      .run()
    if (orphanedRunning.changes || orphanedWaiting.changes) {
      console.log(`[SessionRunner] recovered ${orphanedRunning.changes + orphanedWaiting.changes} orphaned sessions`)
    }

    // Poll for queued sessions every 3 seconds
    this.pollInterval = setInterval(() => {
      this.processQueue()
    }, 3_000)

    // Also process immediately on startup
    this.processQueue()

    // Listen for answer events on Socket.IO
    this.listenForAnswers()

    console.log('[SessionRunner] started — polling for queued sessions')
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }

    // Abort all running sessions
    for (const [, managed] of this.managed) {
      managed.abortController.abort()
    }
    this.managed.clear()

    console.log('[SessionRunner] stopped')
  }

  /** Get managed session for external operations (cancel, answer) */
  getManaged(sessionId: string): ManagedSession | undefined {
    return this.managed.get(sessionId)
  }

  // ─── Queue Processing ─────────────────────────────────────────────────

  private processQueue(): void {
    // Get all queued sessions
    const queued = db
      .select()
      .from(sessions)
      .where(eq(sessions.status, 'queued'))
      .all()

    for (const session of queued) {
      // Check concurrency limits for this project
      const project = db
        .select()
        .from(projects)
        .where(eq(projects.id, session.project_id))
        .get()

      if (!project) continue

      const runningCount = db
        .select()
        .from(sessions)
        .where(and(eq(sessions.project_id, session.project_id), eq(sessions.status, 'running')))
        .all()
        .length

      if (runningCount >= project.max_concurrent_agents) continue

      // Start this session
      this.startSession(session)
    }
  }

  // ─── Session Execution ────────────────────────────────────────────────

  private startSession(session: typeof sessions.$inferSelect): void {
    // Prevent double-start if already managed
    if (this.managed.has(session.id)) return

    const abortController = new AbortController()
    const managed: ManagedSession = {
      sessionId: session.id,
      projectId: session.project_id,
      abortController,
      claudeSessionId: null,
      pendingAnswer: null,
      eventCounter: 0,
    }

    this.managed.set(session.id, managed)

    // Update status to running
    const now = Math.floor(Date.now() / 1000)
    db.update(sessions)
      .set({ status: 'running', started_at: now })
      .where(eq(sessions.id, session.id))
      .run()

    emitToProject(session.project_id, 'session:lifecycle', {
      session: { ...session, status: 'running', started_at: now },
      action: 'started',
    })

    // Push initial system event
    this.pushEvent(managed, 'system', { content: 'Session started' })

    // Run agent asynchronously
    this.runAgent(managed, session.prompt, session.model, false).catch((err) => {
      console.error(`[SessionRunner] unexpected error for session ${session.id}:`, err)
    })
  }

  private async runAgent(
    managed: ManagedSession,
    prompt: string,
    model: string,
    isResume: boolean,
  ): Promise<void> {
    const { sessionId, abortController } = managed

    const modelId = MODEL_MAP[model] ?? MODEL_MAP.sonnet

    const options: Record<string, unknown> = {
      model: modelId,
      cwd: this.projectRoot,
      permissionMode: 'bypassPermissions',
      abortController,
      systemPrompt: 'claude_code',
      canUseTool: this.makeCanUseTool(managed),
    }

    if (isResume && managed.claudeSessionId) {
      options.resume = managed.claudeSessionId
    }

    try {
      const agentQuery = query({
        prompt,
        options: options as Parameters<typeof query>[0]['options'],
      })

      for await (const message of agentQuery) {
        if (abortController.signal.aborted) break
        this.handleMessage(managed, message)
      }

      // Agent finished — mark as completed if still running
      if (!abortController.signal.aborted) {
        const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
        if (current && (current.status === 'running' || current.status === 'waiting_input')) {
          const now = Math.floor(Date.now() / 1000)
          db.update(sessions)
            .set({ status: 'completed', finished_at: now })
            .where(eq(sessions.id, sessionId))
            .run()

          this.pushEvent(managed, 'system', { content: 'Session completed' })
          emitToProject(managed.projectId, 'session:lifecycle', {
            session: { ...current, status: 'completed', finished_at: now },
            action: 'completed',
          })
        }
      }
    } catch (err: unknown) {
      const errStr = String(err)
      // Abort errors are expected — don't treat as failures
      if (errStr.includes('aborted') || errStr.includes('AbortError')) return

      console.error(`[SessionRunner] agent error for session ${sessionId}:`, err)

      const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (current && current.status === 'running') {
        const now = Math.floor(Date.now() / 1000)
        db.update(sessions)
          .set({ status: 'failed', finished_at: now })
          .where(eq(sessions.id, sessionId))
          .run()

        this.pushEvent(managed, 'error', { content: errStr })
        emitToProject(managed.projectId, 'session:lifecycle', {
          session: { ...current, status: 'failed', finished_at: now },
          action: 'failed',
        })
      }
    } finally {
      this.managed.delete(sessionId)
    }
  }

  // ─── Message Handling ─────────────────────────────────────────────────

  private handleMessage(managed: ManagedSession, message: Record<string, unknown>): void {
    const type = message.type as string

    if (type === 'system') {
      this.handleSystemMessage(managed, message)
    } else if (type === 'assistant') {
      this.handleAssistantMessage(managed, message)
    } else if (type === 'user') {
      this.handleUserMessage(managed, message)
    } else if (type === 'result') {
      this.handleResultMessage(managed, message)
    }
  }

  private handleSystemMessage(managed: ManagedSession, message: Record<string, unknown>): void {
    const subtype = message.subtype as string | undefined
    if (subtype === 'init') {
      managed.claudeSessionId = (message as Record<string, unknown>).session_id as string | null

      // Store claude session ID in DB for resume support
      if (managed.claudeSessionId) {
        db.update(sessions)
          .set({ claude_session_id: managed.claudeSessionId })
          .where(eq(sessions.id, managed.sessionId))
          .run()
      }
    }
  }

  private handleAssistantMessage(managed: ManagedSession, message: Record<string, unknown>): void {
    const msg = message.message as Record<string, unknown> | undefined
    const content = msg?.content as Array<Record<string, unknown>> | undefined
    if (!content) return

    for (const block of content) {
      if (block.type === 'text') {
        this.pushEvent(managed, 'assistant', {
          content: block.text as string,
        })
      } else if (block.type === 'tool_use') {
        const toolName = block.name as string ?? 'unknown'
        const toolInput = this.formatToolInput(toolName, block.input as Record<string, unknown>)
        this.pushEvent(managed, 'tool_use', {
          content: `${toolName}: ${toolInput}`.slice(0, 200),
          toolName,
          toolInput,
        })
      }
    }
  }

  private handleUserMessage(managed: ManagedSession, message: Record<string, unknown>): void {
    const msg = message.message as Record<string, unknown> | undefined
    const content = msg?.content as Array<Record<string, unknown>> | undefined
    if (!content) return

    for (const block of content) {
      if (block.type === 'tool_result') {
        const resultContent = block.content as string | Array<Record<string, unknown>>
        let resultText: string
        if (typeof resultContent === 'string') {
          resultText = resultContent
        } else if (Array.isArray(resultContent)) {
          resultText = resultContent
            .filter((b) => b.type === 'text')
            .map((b) => b.text as string)
            .join('\n')
        } else {
          resultText = String(resultContent ?? '')
        }

        this.pushEvent(managed, 'tool_result', {
          content: resultText.slice(0, 3000),
          toolResult: resultText.slice(0, 3000),
        })
      }
    }
  }

  private handleResultMessage(managed: ManagedSession, message: Record<string, unknown>): void {
    const costUsd = message.cost_usd as number | undefined
    const durationMs = message.duration_ms as number | undefined
    const totalTurns = message.num_turns as number | undefined

    this.pushEvent(managed, 'result', {
      content: JSON.stringify({
        costUsd: costUsd ?? 0,
        durationMs: durationMs ?? 0,
        totalTurns: totalTurns ?? 0,
      }),
    })
  }

  // ─── canUseTool callback helpers ──────────────────────────────────────

  private makeCanUseTool(managed: ManagedSession) {
    return async (toolName: string, input: Record<string, unknown>) => {
      if (toolName === 'AskUserQuestion') {
        return this.handleAskUserQuestion(managed, input)
      }

      // Auto-approve all other tools
      return { behavior: 'allow' as const, updatedInput: input }
    }
  }

  private async handleAskUserQuestion(
    managed: ManagedSession,
    input: Record<string, unknown>,
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> }> {
    // Extract question
    const questions = input.questions as Array<{ question: string }> | undefined
    const questionText = questions?.[0]?.question ?? (input.question as string ?? 'Agent needs input')
    const options = (input.options as string[]) ?? []
    const context = (input.context as string) ?? ''

    // Update session status to waiting_input
    db.update(sessions)
      .set({ status: 'waiting_input' })
      .where(eq(sessions.id, managed.sessionId))
      .run()

    // Push question event
    this.pushEvent(managed, 'tool_use', {
      content: questionText,
      toolName: 'AskUserQuestion',
      toolInput: JSON.stringify({ question: questionText, options, context }),
      questionData: { text: questionText, options, context },
    })

    // Emit question event for UI
    emitToSession(managed.sessionId, 'session:question', {
      sessionId: managed.sessionId,
      question: { text: questionText, options, context },
    })
    emitToProject(managed.projectId, 'session:lifecycle', {
      session: { id: managed.sessionId, status: 'waiting_input' },
      action: 'waiting_input',
    })

    // Wait for user answer OR abort
    const userAnswer = await new Promise<string>((resolve, reject) => {
      managed.pendingAnswer = resolve
      const onAbort = () => reject(new DOMException('Session cancelled', 'AbortError'))
      managed.abortController.signal.addEventListener('abort', onAbort, { once: true })
    })
    managed.pendingAnswer = null

    // Update status back to running
    db.update(sessions)
      .set({ status: 'running' })
      .where(eq(sessions.id, managed.sessionId))
      .run()

    emitToProject(managed.projectId, 'session:lifecycle', {
      session: { id: managed.sessionId, status: 'running' },
      action: 'resumed',
    })

    // Return modified input with answer
    const updatedInput = {
      ...input,
      answers: { [questionText]: userAnswer },
    }

    return { behavior: 'allow' as const, updatedInput }
  }

  // ─── Event Storage & Emission ─────────────────────────────────────────

  private pushEvent(
    managed: ManagedSession,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    const now = Math.floor(Date.now() / 1000)

    // Insert into DB
    const result = db.insert(sessionEvents).values({
      session_id: managed.sessionId,
      event_type: eventType as typeof sessionEvents.$inferInsert['event_type'],
      data: JSON.stringify(data),
      created_at: now,
    }).run()

    const eventId = Number(result.lastInsertRowid)

    // Emit via Socket.IO
    emitToSession(managed.sessionId, 'session:event', {
      sessionId: managed.sessionId,
      event: {
        id: eventId,
        sessionId: managed.sessionId,
        eventType,
        data,
        createdAt: now,
      },
    })
  }

  // ─── External Operations ──────────────────────────────────────────────

  cancelSession(sessionId: string): boolean {
    const managed = this.managed.get(sessionId)
    if (!managed) return false

    managed.abortController.abort()

    const now = Math.floor(Date.now() / 1000)
    db.update(sessions)
      .set({ status: 'cancelled', finished_at: now })
      .where(eq(sessions.id, sessionId))
      .run()

    this.pushEvent(managed, 'system', { content: 'Session cancelled by user' })
    emitToProject(managed.projectId, 'session:lifecycle', {
      session: { id: sessionId, status: 'cancelled', finished_at: now },
      action: 'cancelled',
    })
    emitToSession(sessionId, 'session:cancelled', { session_id: sessionId })

    return true
  }

  answerQuestion(sessionId: string, answer: string): boolean {
    const managed = this.managed.get(sessionId)
    if (!managed?.pendingAnswer) return false

    // Push answer event
    this.pushEvent(managed, 'system', { content: `User answered: ${answer}` })

    // Resolve the pending promise
    managed.pendingAnswer(answer)
    return true
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private formatToolInput(toolName: string, input: Record<string, unknown>): string {
    if (!input) return ''
    if (toolName === 'Bash') return (input.command as string ?? '').slice(0, 100)
    if (toolName === 'Read') return (input.file_path as string ?? '').split('/').slice(-2).join('/')
    if (toolName === 'Edit' || toolName === 'Write') return (input.file_path as string ?? '').split('/').slice(-2).join('/')
    if (toolName === 'Grep') return `"${(input.pattern as string ?? '').slice(0, 40)}"`
    if (toolName === 'Glob') return (input.pattern as string ?? '').slice(0, 60)
    return JSON.stringify(input).slice(0, 80)
  }

  private listenForAnswers(): void {
    try {
      const io = getIO()
      io.on('connection', (socket) => {
        socket.on('session:answer', (data: { sessionId: string; answer: string }) => {
          this.answerQuestion(data.sessionId, data.answer)
        })
      })
    } catch {
      // Socket.IO may not be initialized yet — answers will come via REST
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let runner: SessionRunner | null = null

export function initSessionRunner(projectRoot: string): SessionRunner {
  runner = new SessionRunner(projectRoot)
  runner.start()
  return runner
}

export function getSessionRunner(): SessionRunner | null {
  return runner
}

export function stopSessionRunner(): void {
  runner?.stop()
  runner = null
}
