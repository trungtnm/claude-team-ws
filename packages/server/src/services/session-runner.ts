import { query } from '@anthropic-ai/claude-agent-sdk'
import { eq, and } from 'drizzle-orm'
import { writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir, homedir } from 'os'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import { sessions, sessionEvents, projects, activityLog, users, notifications, sessionAuditLog } from '../db/schema.js'
import { emitToProject, emitToSession, getIO } from './socket-manager.js'

// ─── Types ─────────────────────────────────────────────────────────────────

export interface CapabilityItem {
  name: string
  description?: string
}

export interface SessionCapabilities {
  commands: CapabilityItem[]
  agents: CapabilityItem[]
  skills: CapabilityItem[]
  tools: string[]
}

export interface Attachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  /** base64-encoded data */
  data: string
}

interface SessionLimits {
  maxInputTokens: number
  maxOutputTokens: number
  maxToolCalls: number
}

const DEFAULT_LIMITS: SessionLimits = {
  maxInputTokens: 2_000_000,
  maxOutputTokens: 500_000,
  maxToolCalls: 500,
}

interface ManagedSession {
  sessionId: string
  projectId: string
  abortController: AbortController
  claudeSessionId: string | null
  pendingAnswer: ((answer: string) => void) | null
  eventCounter: number
  permissionMode: string
  targetDir: string
  /** Cached command policy (loaded once at session start) */
  commandPolicy: CommandPolicy
  /** Token usage tracking */
  inputTokens: number
  outputTokens: number
  toolCallCount: number
  toolCallTimestamps: number[]
  limits: SessionLimits
  /** Flags to avoid spamming warnings */
  inputWarned: boolean
  outputWarned: boolean
  toolCountWarned: boolean
  rateWarned: boolean
}

// Temp directory for saving attached files so the agent can Read them
const ATTACHMENTS_DIR = join(tmpdir(), 'ctw-attachments')
if (!existsSync(ATTACHMENTS_DIR)) mkdirSync(ATTACHMENTS_DIR, { recursive: true })

// ─── Session Runner ────────────────────────────────────────────────────────

const MODEL_MAP: Record<string, string> = {
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
  haiku: 'claude-haiku-4-5-20251001',
}

const PERMISSION_MODE_MAP: Record<string, string> = {
  default: 'default',
  plan: 'plan',
  acceptEdits: 'acceptEdits',
  bypassPermissions: 'bypassPermissions',
}

// ─── Command Policy Engine ──────────────────────────────────────────────────

interface CommandPolicy {
  hard_block_patterns: string[]
  pause_ask_patterns: string[]
  secret_file_patterns: string[]
}

// Patterns are regexes (case-insensitive). Use \b for word boundaries, \s* for flexible whitespace.
const DEFAULT_POLICY: CommandPolicy = {
  hard_block_patterns: [
    'rm\\s+-rf\\s+/',
    'rm\\s+-rf\\s+~',
    'rm\\s+-rf\\s+\\$HOME',
    '\\bsudo\\b',
    'curl\\s.*\\|\\s*(ba)?sh',
    'wget\\s.*\\|\\s*(ba)?sh',
    '\\|\\s*base64\\s.*\\|\\s*(ba)?sh',
    'git\\s+push\\s+(-f|--force)\\s+(main|master|production)',
    '\\bshutdown\\b',
    '\\breboot\\b',
    'kill\\s+-9\\s+1\\b',
    'docker\\s+run\\s+--privileged',
    '\\bnpm\\s+publish\\b',
    '\\bdocker\\s+push\\b',
    'mkfs\\b',
    'dd\\s+if=',
  ],
  pause_ask_patterns: [
    'rm\\s+(-r|-rf|--recursive)',
    'git\\s+push',
    'git\\s+reset\\s+--hard',
    'git\\s+checkout\\s+\\.',
    'git\\s+clean',
    'chmod\\s+-R\\s+777',
  ],
  secret_file_patterns: [
    '.env',
    '*.pem',
    '*.key',
    '.ssh/',
    '.aws/',
    '.config/gcloud/',
    '/proc/self/environ',
    'id_rsa',
    'id_ed25519',
    'credentials.json',
  ],
}

type PolicyResult = 'allow' | 'block' | 'ask'

/** Compile regex patterns with caching for performance */
const regexCache = new Map<string, RegExp>()
function getPatternRegex(pattern: string): RegExp {
  let re = regexCache.get(pattern)
  if (!re) {
    re = new RegExp(pattern, 'i')
    regexCache.set(pattern, re)
  }
  return re
}

function evaluateCommandPolicy(command: string, policy: CommandPolicy): PolicyResult {
  const normalized = command.trim()

  // Check hard-block patterns first (regex-based)
  for (const pattern of policy.hard_block_patterns) {
    if (getPatternRegex(pattern).test(normalized)) return 'block'
  }

  // Check pause-ask patterns
  for (const pattern of policy.pause_ask_patterns) {
    if (getPatternRegex(pattern).test(normalized)) return 'ask'
  }

  return 'allow'
}

function evaluateFilePolicy(filePath: string, policy: CommandPolicy): PolicyResult {
  const normalized = filePath.toLowerCase()

  for (const pattern of policy.secret_file_patterns) {
    const p = pattern.toLowerCase()
    if (p.startsWith('*')) {
      // Wildcard suffix match
      if (normalized.endsWith(p.slice(1))) return 'block'
    } else if (p.endsWith('/')) {
      // Directory prefix match
      if (normalized.includes(p)) return 'block'
    } else {
      // Exact or contains match
      if (normalized.includes(p)) return 'block'
    }
  }

  return 'allow'
}

function loadSessionLimits(projectId: string): SessionLimits {
  const project = db.select({
    max_session_input_tokens: projects.max_session_input_tokens,
    max_session_output_tokens: projects.max_session_output_tokens,
    max_session_tool_calls: projects.max_session_tool_calls,
  }).from(projects).where(eq(projects.id, projectId)).get()

  return {
    maxInputTokens: project?.max_session_input_tokens ?? DEFAULT_LIMITS.maxInputTokens,
    maxOutputTokens: project?.max_session_output_tokens ?? DEFAULT_LIMITS.maxOutputTokens,
    maxToolCalls: project?.max_session_tool_calls ?? DEFAULT_LIMITS.maxToolCalls,
  }
}

function loadProjectPolicy(projectId: string): CommandPolicy {
  const project = db.select({ command_policy: projects.command_policy }).from(projects).where(eq(projects.id, projectId)).get()
  if (project?.command_policy) {
    try {
      const custom = JSON.parse(project.command_policy) as Partial<CommandPolicy>
      return {
        hard_block_patterns: custom.hard_block_patterns ?? DEFAULT_POLICY.hard_block_patterns,
        pause_ask_patterns: custom.pause_ask_patterns ?? DEFAULT_POLICY.pause_ask_patterns,
        secret_file_patterns: custom.secret_file_patterns ?? DEFAULT_POLICY.secret_file_patterns,
      }
    } catch {
      return DEFAULT_POLICY
    }
  }
  return DEFAULT_POLICY
}

class SessionRunner {
  private managed = new Map<string, ManagedSession>()
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private projectRoot: string
  private lastCapabilities: SessionCapabilities | null = null

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

  /** Get last-known capabilities from any session's system.init */
  getCapabilities(): SessionCapabilities | null {
    return this.lastCapabilities
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
    const targetDir = session.target_dir || this.projectRoot
    const managed: ManagedSession = {
      sessionId: session.id,
      projectId: session.project_id,
      abortController,
      claudeSessionId: session.claude_session_id ?? null,
      pendingAnswer: null,
      eventCounter: 0,
      permissionMode: session.permission_mode ?? 'default',
      targetDir,
      commandPolicy: loadProjectPolicy(session.project_id),
      inputTokens: 0,
      outputTokens: 0,
      toolCallCount: 0,
      toolCallTimestamps: [],
      limits: loadSessionLimits(session.project_id),
      inputWarned: false,
      outputWarned: false,
      toolCountWarned: false,
      rateWarned: false,
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

    // Fetch user's API key for session env
    const sessionEnv = this.buildSessionEnv(session.user_id, session.project_id)

    // Run agent asynchronously
    this.runAgent(managed, session.prompt, session.model, false, sessionEnv).catch((err) => {
      console.error(`[SessionRunner] unexpected error for session ${session.id}:`, err)
    })
  }

  private async runAgent(
    managed: ManagedSession,
    prompt: string,
    model: string,
    isResume: boolean,
    sessionEnv?: Record<string, string | undefined>,
  ): Promise<void> {
    const { sessionId, targetDir, permissionMode } = managed
    // Capture the abort controller for this invocation — sendMessage() may replace it mid-flight
    const myAbortController = managed.abortController

    const modelId = MODEL_MAP[model] ?? MODEL_MAP.sonnet
    const resolvedMode = PERMISSION_MODE_MAP[permissionMode] ?? 'default'

    const options: Record<string, unknown> = {
      model: modelId,
      cwd: targetDir,
      additionalDirectories: [targetDir],
      permissionMode: resolvedMode,
      allowDangerouslySkipPermissions: resolvedMode === 'bypassPermissions',
      abortController: myAbortController,
      settingSources: ['user', 'project'],
      systemPrompt: { type: 'preset', preset: 'claude_code' },
      canUseTool: this.makeCanUseTool(managed),
      ...(sessionEnv && { env: sessionEnv }),
    }

    if (isResume && managed.claudeSessionId) {
      options.resume = managed.claudeSessionId
    }

    try {
      const agentQuery = query({
        prompt,
        options: options as Parameters<typeof query>[0]['options'],
      })

      // Enrich capabilities with descriptions from the SDK (runs in background)
      if (!isResume) {
        this.enrichCapabilities(agentQuery, managed).catch(() => { /* ignore */ })
      }

      for await (const message of agentQuery) {
        if (myAbortController.signal.aborted) break
        this.handleMessage(managed, message)
      }

      // Agent finished its turn → go idle (NOT completed)
      if (!myAbortController.signal.aborted) {
        const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
        if (current && (current.status === 'running' || current.status === 'waiting_input')) {
          db.update(sessions)
            .set({ status: 'idle' })
            .where(eq(sessions.id, sessionId))
            .run()

          this.pushEvent(managed, 'system', { content: 'Agent turn completed — session idle. Send a follow-up message or click Complete.' })
          emitToProject(managed.projectId, 'session:lifecycle', {
            session: { ...current, status: 'idle' },
            action: 'idle',
          })
        }
      }
    } catch (err: unknown) {
      const errStr = String(err)
      // Abort errors are expected — don't treat as failures
      if (errStr.includes('aborted') || errStr.includes('AbortError')) return

      console.error(`[SessionRunner] agent error for session ${sessionId}:`, err)

      const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (current && (current.status === 'running' || current.status === 'waiting_input')) {
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

        db.insert(activityLog).values({
          project_id: managed.projectId,
          user_id: current.user_id,
          action: 'session_failed',
          details: JSON.stringify({ session_id: sessionId, error: errStr.slice(0, 500) }),
        }).run()

        // Notify session owner of failure
        db.insert(notifications).values({
          id: `notif_fail_${sessionId}_${Date.now()}`,
          user_id: current.user_id,
          project_id: managed.projectId,
          type: 'agent_complete',
          title: 'Agent session failed',
          body: `Session "${current.name || current.prompt.slice(0, 50)}" failed: ${errStr.slice(0, 150)}`,
          link: `/agents/${sessionId}`,
        }).run()
      }
    } finally {
      // Persist token counters before cleanup so they survive resume
      this.saveTokenCounters(sessionId)

      // Only clean up if this invocation's abort controller is still current.
      // If sendMessage() replaced it, a new runAgent() is already running — don't interfere.
      if (managed.abortController === myAbortController) {
        const current = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
        if (current?.status !== 'idle') {
          this.managed.delete(sessionId)
        }
      }
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

      // Extract capabilities from init message
      const toItems = (arr: unknown[]) =>
        (arr ?? []).filter((s): s is string => typeof s === 'string').map((name) => ({ name }))

      const capabilities: SessionCapabilities = {
        commands: toItems(message.slash_commands as unknown[]),
        agents: toItems(message.agents as unknown[]),
        skills: toItems(message.skills as unknown[]),
        tools: ((message.tools as string[]) ?? []),
      }
      this.lastCapabilities = capabilities

      this.pushEvent(managed, 'system', {
        content: `Initialized. Model: ${(message.model as string) ?? 'unknown'}. Tools: ${capabilities.tools.length} available.`,
      })
    }
  }

  private handleAssistantMessage(managed: ManagedSession, message: Record<string, unknown>): void {
    const msg = message.message as Record<string, unknown> | undefined
    const content = msg?.content as Array<Record<string, unknown>> | undefined
    if (!content) return

    // Extract context window usage
    const usage = msg?.usage as Record<string, number> | undefined
    if (usage) {
      const inputTokens = usage.input_tokens ?? 0
      const cacheCreation = usage.cache_creation_input_tokens ?? 0
      const cacheRead = usage.cache_read_input_tokens ?? 0
      const outputTokens = usage.output_tokens ?? 0
      const contextSize = 200000
      const usedTokens = inputTokens + cacheCreation + cacheRead
      const usedPercentage = Math.round((usedTokens / contextSize) * 100)

      // Accumulate token usage for cost cap enforcement.
      // Only count non-cached input_tokens — cache_read (0.1x) and cache_creation (1.25x)
      // don't represent full-cost API usage and would inflate the cap prematurely.
      managed.inputTokens += inputTokens
      managed.outputTokens += outputTokens

      // Check cost caps
      const { limits } = managed
      const inputPct = (managed.inputTokens / limits.maxInputTokens) * 100
      const outputPct = (managed.outputTokens / limits.maxOutputTokens) * 100

      if (inputPct >= 100 || outputPct >= 100) {
        this.pushEvent(managed, 'error', {
          content: `⛔ Session stopped: token limit reached (input: ${Math.round(inputPct)}%, output: ${Math.round(outputPct)}%)`,
        })
        managed.abortController.abort()
        return
      }

      if ((inputPct >= 80 && !managed.inputWarned) || (outputPct >= 80 && !managed.outputWarned)) {
        this.pushEvent(managed, 'system', {
          content: `⚠️ Token usage warning: input ${Math.round(inputPct)}% (${managed.inputTokens}/${limits.maxInputTokens}), output ${Math.round(outputPct)}% (${managed.outputTokens}/${limits.maxOutputTokens})`,
        })
        if (inputPct >= 80) managed.inputWarned = true
        if (outputPct >= 80) managed.outputWarned = true
      }

      // Push a context window update event (frontend can extract this)
      this.pushEvent(managed, 'system', {
        content: `Context: ${usedPercentage}% used`,
        contextWindow: {
          contextWindowSize: contextSize,
          usedPercentage,
          currentUsage: { inputTokens, outputTokens, cacheCreationInputTokens: cacheCreation, cacheReadInputTokens: cacheRead },
        },
      })
    }

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
    const costUsd = message.total_cost_usd as number ?? message.cost_usd as number ?? 0
    const durationMs = message.duration_ms as number ?? 0
    const totalTurns = message.num_turns as number ?? 0
    const usage = message.usage as Record<string, number> | undefined
    const tokensUsed = usage
      ? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0)
        + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0)
      : 0

    this.pushEvent(managed, 'result', {
      content: JSON.stringify({
        costUsd,
        durationMs,
        totalTurns,
        tokensUsed,
        subtype: message.subtype as string ?? 'success',
      }),
    })
  }

  // ─── canUseTool callback helpers ──────────────────────────────────────

  private makeCanUseTool(managed: ManagedSession) {
    const { commandPolicy } = managed

    return async (toolName: string, input: Record<string, unknown>) => {
      if (toolName === 'AskUserQuestion') {
        return this.handleAskUserQuestion(managed, input)
      }

      // ── Tool call counting + rate limiting ──
      const now = Date.now()
      managed.toolCallCount++
      managed.toolCallTimestamps.push(now)

      // Sliding window: keep only last 60 seconds of timestamps
      const oneMinuteAgo = now - 60_000
      managed.toolCallTimestamps = managed.toolCallTimestamps.filter((t) => t > oneMinuteAgo)
      const callsPerMinute = managed.toolCallTimestamps.length

      // Tool count cap
      if (managed.toolCallCount >= managed.limits.maxToolCalls) {
        this.pushEvent(managed, 'error', {
          content: `⛔ Session stopped: tool call limit reached (${managed.toolCallCount}/${managed.limits.maxToolCalls})`,
        })
        managed.abortController.abort()
        return { behavior: 'allow' as const, updatedInput: input }
      }

      if (managed.toolCallCount >= managed.limits.maxToolCalls * 0.8 && !managed.toolCountWarned) {
        managed.toolCountWarned = true
        this.pushEvent(managed, 'system', {
          content: `⚠️ Tool call warning: ${managed.toolCallCount}/${managed.limits.maxToolCalls} calls used`,
        })
      }

      // Rate limit: >60 calls/min → auto-pause
      if (callsPerMinute > 60) {
        this.pushEvent(managed, 'system', {
          content: `⚠️ Rate limit: ${callsPerMinute} tool calls/min. Session paused — send a message to continue.`,
        })
        db.update(sessions)
          .set({ status: 'waiting_input' })
          .where(eq(sessions.id, managed.sessionId))
          .run()
        emitToProject(managed.projectId, 'session:lifecycle', {
          session: { id: managed.sessionId, status: 'waiting_input' },
          action: 'rate_limited',
        })
        // Wait for user to continue
        await new Promise<string>((resolve, reject) => {
          managed.pendingAnswer = resolve
          const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
          managed.abortController.signal.addEventListener('abort', onAbort, { once: true })
        })
        managed.pendingAnswer = null
        managed.toolCallTimestamps = [] // Reset rate window
        db.update(sessions)
          .set({ status: 'running' })
          .where(eq(sessions.id, managed.sessionId))
          .run()
      } else if (callsPerMinute > 30 && !managed.rateWarned) {
        managed.rateWarned = true
        this.pushEvent(managed, 'system', {
          content: `⚠️ High tool call rate: ${callsPerMinute}/min`,
        })
      }

      // ── Bash command policy ──
      if (toolName === 'Bash') {
        const command = (input.command as string) ?? ''
        const result = evaluateCommandPolicy(command, commandPolicy)

        if (result === 'block') {
          this.pushEvent(managed, 'system', {
            content: `⛔ BLOCKED: ${command.slice(0, 100)}`,
          })
          this.logAudit(managed.sessionId, 'Bash', command.slice(0, 300), 'block')
          return {
            behavior: 'allow' as const,
            updatedInput: { ...input, command: `echo "BLOCKED by safety policy: command not allowed"` },
          }
        }

        if (result === 'ask') {
          const approved = await this.askUserApproval(
            managed,
            `Agent wants to run: \`${command.slice(0, 200)}\``,
            'This command requires approval per project safety policy.',
          )
          this.logAudit(managed.sessionId, 'Bash', command.slice(0, 300), 'ask', approved ? 'approved' : 'denied')
          if (!approved) {
            this.pushEvent(managed, 'system', {
              content: `⚠️ DENIED by user: ${command.slice(0, 100)}`,
            })
            return {
              behavior: 'allow' as const,
              updatedInput: { ...input, command: `echo "DENIED by user: command not approved"` },
            }
          }
        }
      }

      // ── Read: check secret file deny-list ──
      if (toolName === 'Read') {
        const filePath = (input.file_path as string) ?? ''
        const result = evaluateFilePolicy(filePath, commandPolicy)

        if (result === 'block') {
          this.pushEvent(managed, 'system', {
            content: `⛔ BLOCKED: read of secret file ${filePath.split('/').pop()}`,
          })
          return {
            behavior: 'allow' as const,
            updatedInput: { ...input, file_path: '/dev/null' },
          }
        }
      }

      // ── Write/Edit: check if outside target directory ──
      if ((toolName === 'Write' || toolName === 'Edit') && managed.targetDir) {
        const filePath = (input.file_path as string) ?? ''
        if (filePath && !filePath.startsWith(managed.targetDir)) {
          const approved = await this.askUserApproval(
            managed,
            `Agent wants to write to: \`${filePath}\``,
            `This file is outside the target directory (${managed.targetDir}).`,
          )
          if (!approved) {
            this.pushEvent(managed, 'system', {
              content: `⚠️ DENIED: write outside target dir to ${filePath.split('/').pop()}`,
            })
            return {
              behavior: 'allow' as const,
              updatedInput: input,
            }
          }
        }
      }

      // Auto-approve all other tools — log to audit
      this.logAudit(managed.sessionId, toolName, this.summarizeToolInput(toolName, input), 'allow')
      return { behavior: 'allow' as const, updatedInput: input }
    }
  }

  /** Log a tool call to the session audit log */
  private logAudit(sessionId: string, toolName: string, inputSummary: string, policyResult: 'allow' | 'ask' | 'block', userDecision?: string): void {
    try {
      db.insert(sessionAuditLog).values({
        session_id: sessionId,
        tool_name: toolName,
        tool_input_summary: inputSummary.slice(0, 500),
        policy_result: policyResult,
        user_decision: userDecision ?? null,
      }).run()
    } catch {
      // Audit logging should never block tool execution
    }
  }

  /** Redact and summarize tool input for audit logging */
  private summarizeToolInput(toolName: string, input: Record<string, unknown>): string {
    if (toolName === 'Bash') return (input.command as string ?? '').slice(0, 300)
    if (toolName === 'Read') return (input.file_path as string ?? '')
    if (toolName === 'Write' || toolName === 'Edit') return (input.file_path as string ?? '')
    if (toolName === 'Grep') return `pattern: ${(input.pattern as string ?? '').slice(0, 100)}`
    if (toolName === 'Glob') return `pattern: ${(input.pattern as string ?? '').slice(0, 100)}`
    return JSON.stringify(input).slice(0, 200)
  }

  /** Ask user for approval via the same Q&A mechanism used by AskUserQuestion */
  private async askUserApproval(managed: ManagedSession, question: string, context: string): Promise<boolean> {
    // Update session status to waiting_input
    db.update(sessions)
      .set({ status: 'waiting_input' })
      .where(eq(sessions.id, managed.sessionId))
      .run()

    this.pushEvent(managed, 'tool_use', {
      content: question,
      toolName: 'SafetyApproval',
      toolInput: context,
      questionData: {
        text: question,
        options: ['Approve', 'Deny'],
        context,
      },
    })

    emitToSession(managed.sessionId, 'session:question', {
      sessionId: managed.sessionId,
      question: { text: question, options: ['Approve', 'Deny'], context },
    })
    emitToProject(managed.projectId, 'session:lifecycle', {
      session: { id: managed.sessionId, status: 'waiting_input' },
      action: 'waiting_input',
    })

    // Wait for user answer
    const answer = await new Promise<string>((resolve, reject) => {
      managed.pendingAnswer = resolve
      const onAbort = () => reject(new DOMException('Session cancelled', 'AbortError'))
      managed.abortController.signal.addEventListener('abort', onAbort, { once: true })
    })
    managed.pendingAnswer = null

    // Restore running status
    db.update(sessions)
      .set({ status: 'running' })
      .where(eq(sessions.id, managed.sessionId))
      .run()

    emitToProject(managed.projectId, 'session:lifecycle', {
      session: { id: managed.sessionId, status: 'running' },
      action: 'resumed',
    })

    return answer.toLowerCase().includes('approve') || answer.toLowerCase() === 'yes'
  }

  private async handleAskUserQuestion(
    managed: ManagedSession,
    input: Record<string, unknown>,
  ): Promise<{ behavior: 'allow'; updatedInput: Record<string, unknown> }> {
    // Extract question — handle both new format (questions array) and old format
    const questions = input.questions as Array<{ question: string; header?: string; options?: Array<string | { label?: string; description?: string }> }> | undefined
    const firstQ = questions?.[0]

    const questionText = firstQ?.question ?? (input.question as string ?? 'Agent needs input')

    const rawOptions = firstQ?.options ?? (input.options as unknown[]) ?? []
    const options = rawOptions.map((o: unknown) =>
      typeof o === 'string' ? o : (o as Record<string, string>).label ?? (o as Record<string, string>).description ?? String(o)
    )
    const context = firstQ?.header ?? (input.context as string) ?? ''

    // Update session status to waiting_input
    db.update(sessions)
      .set({ status: 'waiting_input' })
      .where(eq(sessions.id, managed.sessionId))
      .run()

    // Push question event with questionData for persistence
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

    // Create notification for session owner
    const questionSession = db.select().from(sessions).where(eq(sessions.id, managed.sessionId)).get()
    if (questionSession) {
      db.insert(notifications).values({
        id: `notif_q_${managed.sessionId}_${Date.now()}`,
        user_id: questionSession.user_id,
        project_id: managed.projectId,
        type: 'question_waiting',
        title: 'Agent needs input',
        body: questionText.slice(0, 200),
        link: `/agents/${managed.sessionId}`,
      }).run()
    }

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

  // ─── Capabilities Enrichment ────────────────────────────────────────────

  private async enrichCapabilities(agentQuery: ReturnType<typeof query>, managed: ManagedSession): Promise<void> {
    try {
      const [commands, agents] = await Promise.all([
        (agentQuery as any).supportedCommands?.() ?? [],
        (agentQuery as any).supportedAgents?.() ?? [],
      ])

      const caps = this.lastCapabilities
      if (!caps) return

      // Enrich commands with descriptions
      if (Array.isArray(commands) && commands.length > 0) {
        const cmdMap = new Map<string, string>()
        for (const cmd of commands) {
          if (cmd.name) cmdMap.set(cmd.name, cmd.description ?? '')
        }
        caps.commands = caps.commands.map((c) => ({
          name: c.name,
          description: cmdMap.get(c.name) ?? c.description,
        }))
      }

      // Enrich agents with descriptions
      if (Array.isArray(agents) && agents.length > 0) {
        const agentMap = new Map<string, string>()
        for (const a of agents) {
          if (a.name) agentMap.set(a.name, a.description ?? '')
        }
        caps.agents = caps.agents.map((a) => ({
          name: a.name,
          description: agentMap.get(a.name) ?? a.description,
        }))
      }

      // Enrich skills — use command descriptions where available
      if (caps.skills.length > 0 && Array.isArray(commands)) {
        const cmdMap = new Map<string, string>()
        for (const cmd of commands) {
          if (cmd.name) cmdMap.set(cmd.name, cmd.description ?? '')
        }
        caps.skills = caps.skills.map((s) => ({
          name: s.name,
          description: cmdMap.get(s.name) ?? s.description,
        }))
      }

      this.lastCapabilities = caps
    } catch {
      // SDK methods may not be available — ignore
    }
  }

  // ─── Event Storage & Emission ─────────────────────────────────────────

  /** Redact sensitive patterns from text before storage/emission */
  private static redactSensitive(text: string): string {
    return text
      .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, 'Bearer [REDACTED]')
      .replace(/(CTW_API_KEY|ADMIN_API_KEY|JWT_SECRET|ANTHROPIC_API_KEY|CTW_BOT_API_KEY)=\S+/g, '$1=[REDACTED]')
      .replace(/(?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*\S+/gi, '[REDACTED]')
  }

  /** Recursively redact string values in event data */
  private static redactData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        result[key] = SessionRunner.redactSensitive(value)
      } else {
        result[key] = value
      }
    }
    return result
  }

  private pushEvent(
    managed: ManagedSession,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    const now = Math.floor(Date.now() / 1000)

    // Redact sensitive values before storage
    const safeData = SessionRunner.redactData(data)

    // Insert into DB
    const result = db.insert(sessionEvents).values({
      session_id: managed.sessionId,
      event_type: eventType as typeof sessionEvents.$inferInsert['event_type'],
      data: JSON.stringify(safeData),
      created_at: now,
    }).run()

    const eventId = Number(result.lastInsertRowid)

    // Emit via Socket.IO (use redacted data)
    emitToSession(managed.sessionId, 'session:event', {
      sessionId: managed.sessionId,
      event: {
        id: eventId,
        sessionId: managed.sessionId,
        eventType,
        data: safeData,
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

    this.managed.delete(sessionId)
    return true
  }

  /** Interrupt the current turn — aborts agent but goes to idle (resumable), not cancelled */
  interruptSession(sessionId: string): boolean {
    const managed = this.managed.get(sessionId)
    if (!managed) return false

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session || (session.status !== 'running' && session.status !== 'waiting_input')) return false

    managed.abortController.abort()

    db.update(sessions)
      .set({ status: 'idle' })
      .where(eq(sessions.id, sessionId))
      .run()

    this.pushEvent(managed, 'system', { content: 'Agent interrupted by user — session idle, send a message to resume.' })
    emitToProject(managed.projectId, 'session:lifecycle', {
      session: { id: sessionId, status: 'idle' },
      action: 'idle',
    })

    // Keep managed (don't delete) — session is resumable
    // Create fresh abort controller for next resume
    managed.abortController = new AbortController()
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

  /** Send a follow-up message to an idle, running, or terminal session (resume) */
  sendMessage(sessionId: string, message: string, attachments?: Attachment[]): boolean {
    const managed = this.managed.get(sessionId)
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return false

    // Allow messages to active sessions (idle/running/waiting_input) and terminal sessions (for resume)
    const allowed = new Set(['idle', 'running', 'waiting_input', 'completed', 'failed', 'cancelled'])
    if (!allowed.has(session.status)) {
      return false
    }

    // For terminal sessions, clear finished_at so session is treated as active
    if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
      db.update(sessions)
        .set({ finished_at: null })
        .where(eq(sessions.id, sessionId))
        .run()
    }

    // If running or waiting, abort current execution first (interrupt)
    if (managed && (session.status === 'running' || session.status === 'waiting_input')) {
      managed.abortController.abort()
    }

    // Save attachments to disk
    const savedPaths: string[] = []
    if (attachments?.length) {
      for (const att of attachments) {
        // Sanitize filename to prevent path traversal
        const safeName = att.name.replace(/[/\\]/g, '_').replace(/\.\./g, '_').slice(0, 200)
        const filename = `${sessionId}-${nanoid(6)}-${safeName}`
        const filepath = join(ATTACHMENTS_DIR, filename)
        writeFileSync(filepath, Buffer.from(att.data, 'base64'))
        savedPaths.push(filepath)
      }
    }

    // Build display content for stream event
    const displayContent = savedPaths.length > 0
      ? `${message}\n\n${attachments!.map((a) => `📎 ${a.name}`).join('\n')}`
      : message

    // Set up managed session for resume
    const abortController = new AbortController()
    const targetDir = session.target_dir || this.projectRoot

    if (managed) {
      // Reuse existing managed session with new abort controller
      managed.abortController = abortController
    } else {
      // Create new managed session for idle resume
      const newManaged: ManagedSession = {
        sessionId,
        projectId: session.project_id,
        abortController,
        claudeSessionId: session.claude_session_id ?? null,
        pendingAnswer: null,
        eventCounter: 0,
        permissionMode: session.permission_mode ?? 'default',
        targetDir,
        commandPolicy: loadProjectPolicy(session.project_id),
        inputTokens: session.input_tokens_used ?? 0,
        outputTokens: session.output_tokens_used ?? 0,
        toolCallCount: session.tool_calls_used ?? 0,
        toolCallTimestamps: [],
        limits: loadSessionLimits(session.project_id),
        inputWarned: false,
        outputWarned: false,
        toolCountWarned: false,
        rateWarned: false,
      }
      this.managed.set(sessionId, newManaged)
    }

    const mgd = this.managed.get(sessionId)!

    // Push user message event
    this.pushEvent(mgd, 'system', {
      content: displayContent,
      type: 'user_message',
      ...(attachments?.length ? { attachments } : {}),
    })

    // Update status to running
    db.update(sessions)
      .set({ status: 'running' })
      .where(eq(sessions.id, sessionId))
      .run()

    emitToProject(session.project_id, 'session:lifecycle', {
      session: { ...session, status: 'running' },
      action: 'resumed',
    })

    // Build prompt with file paths
    let prompt = message
    if (savedPaths.length > 0) {
      const fileSection = savedPaths.map((p, i) => {
        const att = attachments![i]
        const typeHint = att.type === 'image'
          ? 'Use the Read tool to view this image'
          : 'Use the Read tool to read this file'
        return `Attached ${att.type}: ${att.name}\nSaved at: ${p}\n${typeHint}`
      }).join('\n\n')
      prompt = `${fileSection}\n\n${message}`
    }

    // Fetch user's API key for session env
    const sessionEnv = this.buildSessionEnv(session.user_id, session.project_id)

    // Run agent asynchronously with resume
    this.runAgent(mgd, prompt, session.model, true, sessionEnv).catch((err) => {
      console.error(`[SessionRunner] unexpected error for session ${sessionId}:`, err)
    })

    return true
  }

  /** Manually complete an idle session */
  completeSession(sessionId: string): boolean {
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session || session.status !== 'idle') return false

    const now = Math.floor(Date.now() / 1000)
    db.update(sessions)
      .set({ status: 'completed', finished_at: now })
      .where(eq(sessions.id, sessionId))
      .run()

    // Push event if managed
    const managed = this.managed.get(sessionId)
    if (managed) {
      this.pushEvent(managed, 'system', { content: 'Session marked as completed.' })
      this.managed.delete(sessionId)
    }

    emitToProject(session.project_id, 'session:lifecycle', {
      session: { ...session, status: 'completed', finished_at: now },
      action: 'completed',
    })

    db.insert(activityLog).values({
      project_id: session.project_id,
      user_id: session.user_id,
      action: 'session_completed',
      details: JSON.stringify({ session_id: sessionId, name: session.name }),
    }).run()

    return true
  }

  /** Update permission mode for a session (takes effect on next resume) */
  setPermissionMode(sessionId: string, mode: string): boolean {
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return false

    db.update(sessions)
      .set({ permission_mode: mode as typeof sessions.$inferInsert['permission_mode'] })
      .where(eq(sessions.id, sessionId))
      .run()

    // Update managed session if it exists
    const managed = this.managed.get(sessionId)
    if (managed) {
      managed.permissionMode = mode
    }

    return true
  }

  /** Delete a single session and its events */
  deleteSession(sessionId: string): boolean {
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) return false

    // Abort if running
    const managed = this.managed.get(sessionId)
    if (managed) {
      managed.abortController.abort()
      this.managed.delete(sessionId)
    }

    // Delete Claude Code history files
    if (session.claude_session_id) {
      this.deleteSessionHistory(session.claude_session_id)
    }

    // Clean up attachment files for this session
    this.cleanupAttachments(sessionId)

    // Delete events first (FK constraint)
    db.delete(sessionEvents).where(eq(sessionEvents.session_id, sessionId)).run()
    db.delete(sessions).where(eq(sessions.id, sessionId)).run()

    emitToProject(session.project_id, 'session:lifecycle', {
      session: { id: sessionId, status: 'deleted' },
      action: 'deleted',
    })

    return true
  }

  /** Persist token/tool usage counters to DB so they survive resume cycles */
  private saveTokenCounters(sessionId: string): void {
    const managed = this.managed.get(sessionId)
    if (!managed) return
    db.update(sessions)
      .set({
        input_tokens_used: managed.inputTokens,
        output_tokens_used: managed.outputTokens,
        tool_calls_used: managed.toolCallCount,
      })
      .where(eq(sessions.id, sessionId))
      .run()
  }

  /** Remove attachment files for a session from the temp directory */
  private cleanupAttachments(sessionId: string): void {
    try {
      if (!existsSync(ATTACHMENTS_DIR)) return
      const files = readdirSync(ATTACHMENTS_DIR)
      for (const file of files) {
        if (file.startsWith(`${sessionId}-`)) {
          unlinkSync(join(ATTACHMENTS_DIR, file))
        }
      }
    } catch {
      // Non-critical — log but don't fail
      console.error(`[SessionRunner] Failed to cleanup attachments for ${sessionId}`)
    }
  }

  /** Delete all completed/failed/cancelled sessions for a project */
  bulkDeleteSessions(projectId: string): { deleted: number; historyDeleted: number } {
    const terminal = db
      .select()
      .from(sessions)
      .where(eq(sessions.project_id, projectId))
      .all()
      .filter((s) => ['completed', 'failed', 'cancelled'].includes(s.status))

    let deleted = 0
    let historyDeleted = 0

    for (const session of terminal) {
      if (session.claude_session_id) {
        const ok = this.deleteSessionHistory(session.claude_session_id)
        if (ok) historyDeleted++
      }
      db.delete(sessionEvents).where(eq(sessionEvents.session_id, session.id)).run()
      db.delete(sessions).where(eq(sessions.id, session.id)).run()
      deleted++
    }

    if (deleted > 0) {
      emitToProject(projectId, 'session:lifecycle', {
        session: null,
        action: 'bulk_deleted',
        count: deleted,
      })
    }

    return { deleted, historyDeleted }
  }

  // ─── Session Environment ────────────────────────────────────────

  private buildSessionEnv(userId: string, projectId: string): Record<string, string | undefined> {
    let apiKey: string | undefined

    if (userId === 'usr_bot') {
      // Background/system sessions use the bot API key
      apiKey = process.env.CTW_BOT_API_KEY
    } else {
      // User-triggered sessions use the starting user's API key
      const user = db.select({ api_key: users.api_key }).from(users).where(eq(users.id, userId)).get()
      apiKey = user?.api_key ?? undefined
    }

    // Explicit allowlist — ONLY these vars reach the agent session.
    // JWT_SECRET, ADMIN_API_KEY, DATABASE_PATH, cloud credentials, MCP tokens are excluded.
    return {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      USER: process.env.USER,
      SHELL: '/bin/bash',
      LANG: process.env.LANG ?? 'en_US.UTF-8',
      TERM: 'xterm-256color',
      NODE_ENV: process.env.NODE_ENV,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, // Required by Agent SDK
      CTW_API_KEY: apiKey,
      CTW_SERVER_URL: `http://localhost:${process.env.PORT || 3000}`,
      CTW_PROJECT_ID: projectId,
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private deleteSessionHistory(claudeSessionId: string): boolean {
    const claudeDir = join(homedir(), '.claude')
    try {
      const projectsDir = join(claudeDir, 'projects')
      if (!existsSync(projectsDir)) return false

      for (const projectHash of readdirSync(projectsDir)) {
        const sessionsDir = join(projectsDir, projectHash, 'sessions')
        if (!existsSync(sessionsDir)) continue

        const sessionFile = join(sessionsDir, `${claudeSessionId}.jsonl`)
        if (existsSync(sessionFile)) {
          unlinkSync(sessionFile)
          return true
        }
      }
    } catch (e) {
      console.warn(`[cleanup] Failed to delete session history for ${claudeSessionId}:`, e)
    }
    return false
  }

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
          // Verify the socket user owns this session or is a techlead
          const socketUser = socket.data?.user as { id: string; role: string } | undefined
          if (!socketUser) return

          const session = db.select().from(sessions).where(eq(sessions.id, data.sessionId)).get()
          if (!session) return
          if (session.user_id !== socketUser.id && socketUser.role !== 'techlead') return

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
