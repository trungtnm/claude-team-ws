import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { sessions, sessionEvents, projects, activityLog, sessionAuditLog } from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject, emitToSession } from '../services/socket-manager.js'
import { getSessionRunner } from '../services/session-runner.js'
import type { Attachment } from '../services/session-runner.js'
import { logError } from '../utils/log-error.js'
import { resolve as resolvePath } from 'path'

// Mounted at /api/projects/:projectId/sessions
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

/** Check if the user owns a session or is a techlead */
function canMutateSession(user: Express.User, sessionUserId: string): boolean {
  return user.id === sessionUserId || user.role === 'techlead'
}

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list sessions for project
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const status = req.query.status as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0

    const rows = db
      .select()
      .from(sessions)
      .where(
        status
          ? and(eq(sessions.project_id, projectId), eq(sessions.status, status as typeof sessions.status.enumValues[number]))
          : eq(sessions.project_id, projectId),
      )
      .orderBy(desc(sessions.created_at))
      .limit(limit)
      .offset(offset)
      .all()

    res.json({ sessions: rows })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

const createSessionSchema = z.object({
  epic_id: z.string().optional(),
  name: z.string().max(200).optional(),
  prompt: z.string().min(1).max(50000),
  model: z.enum(['sonnet', 'opus', 'haiku']).optional(),
  permission_mode: z.enum(['default', 'plan', 'acceptEdits', 'bypassPermissions']).optional(),
  target_dir: z.string().max(500).optional(),
})

// POST / — create session (check concurrency limits)
router.post('/', (req, res) => {
  try {
    const parsed = createSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const user = req.user!
    let { epic_id, name, prompt, model, permission_mode, target_dir } = parsed.data

    // Check concurrency limits
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Validate target_dir is within project root to prevent path traversal
    if (target_dir) {
      const resolved = resolvePath(target_dir)
      if (!resolved.startsWith(project.project_root)) {
        res.status(400).json({ error: 'target_dir must be within the project root' })
        return
      }
    }

    // Permission mode gating: in safety_mode 'b', non-techleads get downgraded from bypassPermissions
    if (permission_mode === 'bypassPermissions' && user.role !== 'techlead' && project.safety_mode === 'b') {
      permission_mode = 'acceptEdits'
    }

    const runningCount = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.project_id, projectId), eq(sessions.status, 'running')))
      .all()
      .length

    if (runningCount >= project.max_concurrent_agents) {
      res.status(429).json({
        error: `Concurrency limit reached (${runningCount}/${project.max_concurrent_agents} running)`,
      })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const id = nanoid()

    db.insert(sessions).values({
      id,
      project_id: projectId,
      epic_id: epic_id ?? null,
      user_id: user.id,
      name: name ?? null,
      model: model ?? 'sonnet',
      status: 'queued',
      permission_mode: permission_mode ?? 'default',
      target_dir: target_dir ?? null,
      prompt,
      created_at: now,
    }).run()

    // Log activity
    db.insert(activityLog).values({
      project_id: projectId,
      user_id: user.id,
      action: 'session_started',
      details: JSON.stringify({ session_id: id }),
      created_at: now,
    }).run()

    const session = db.select().from(sessions).where(eq(sessions.id, id)).get()

    emitToProject(projectId, 'session:lifecycle', { session, action: 'created' })
    res.status(201).json({ session })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

// GET /capabilities — get last-known capabilities (commands, agents, skills)
router.get('/capabilities', (_req, res) => {
  try {
    const runner = getSessionRunner()
    const capabilities = runner?.getCapabilities()
    res.json({ capabilities: capabilities ?? { commands: [], agents: [], skills: [], tools: [] } })
  } catch (err) {
    res.status(500).json({ error: logError('sessions/capabilities', err) })
  }
})

// GET /:sessionId — session detail
router.get('/:sessionId', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    res.json({ session })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/cancel — cancel running/idle session
router.post('/:sessionId/cancel', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')
    const user = req.user!

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (!canMutateSession(user, session.user_id)) {
      res.status(403).json({ error: 'Only the session owner or techlead can cancel sessions' })
      return
    }

    if (!['running', 'queued', 'waiting_input', 'idle'].includes(session.status)) {
      res.status(400).json({ error: `Cannot cancel session in ${session.status} status` })
      return
    }

    // Try to cancel via session runner (which also aborts the SDK process)
    const runner = getSessionRunner()
    const cancelledViaRunner = runner?.cancelSession(sessionId)

    if (!cancelledViaRunner) {
      // Session not managed by runner (e.g., still queued or idle without managed) — update DB directly
      const now = Math.floor(Date.now() / 1000)
      db.update(sessions)
        .set({ status: 'cancelled', finished_at: now })
        .where(eq(sessions.id, sessionId))
        .run()

      emitToProject(projectId, 'session:lifecycle', { session: { ...session, status: 'cancelled', finished_at: now }, action: 'cancelled' })
      emitToSession(sessionId, 'session:cancelled', { session_id: sessionId })
    }

    const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    res.json({ session: updated })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/interrupt — interrupt running agent, session goes idle (resumable)
router.post('/:sessionId/interrupt', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')
    const user = req.user!

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (!canMutateSession(user, session.user_id)) {
      res.status(403).json({ error: 'Only the session owner or techlead can interrupt sessions' })
      return
    }

    if (session.status !== 'running' && session.status !== 'waiting_input') {
      res.status(400).json({ error: `Cannot interrupt session in ${session.status} status` })
      return
    }

    const runner = getSessionRunner()
    const interrupted = runner?.interruptSession(sessionId)

    if (!interrupted) {
      // Fallback: update DB directly
      db.update(sessions)
        .set({ status: 'idle' })
        .where(eq(sessions.id, sessionId))
        .run()

      emitToProject(projectId, 'session:lifecycle', {
        session: { ...session, status: 'idle' },
        action: 'idle',
      })
    }

    const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    res.json({ session: updated })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/resume — resume failed session
router.post('/:sessionId/resume', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (session.status !== 'failed' && session.status !== 'cancelled') {
      res.status(400).json({ error: `Cannot resume session in ${session.status} status` })
      return
    }

    db.update(sessions)
      .set({ status: 'queued', finished_at: null })
      .where(eq(sessions.id, sessionId))
      .run()

    const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    emitToProject(projectId, 'session:lifecycle', { session: updated, action: 'resumed' })
    res.json({ session: updated })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

const answerSchema = z.object({
  answer: z.string().min(1),
})

// POST /:sessionId/answer — answer question
router.post('/:sessionId/answer', (req, res) => {
  try {
    const parsed = answerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (session.status !== 'waiting_input') {
      res.status(400).json({ error: `Session is not waiting for input (status: ${session.status})` })
      return
    }

    // Resolve the pending answer in the session runner
    const runner = getSessionRunner()
    const answered = runner?.answerQuestion(sessionId, parsed.data.answer)

    if (!answered) {
      // Fallback: emit via Socket.IO for legacy/external runners
      emitToSession(sessionId, 'session:answer', {
        session_id: sessionId,
        answer: parsed.data.answer,
      })
    }

    res.json({ status: 'answer_sent' })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/complete — mark idle session as completed
router.post('/:sessionId/complete', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (session.status !== 'idle') {
      res.status(400).json({ error: `Cannot complete session in ${session.status} status — must be idle` })
      return
    }

    const runner = getSessionRunner()
    const completed = runner?.completeSession(sessionId)

    if (!completed) {
      // Fallback: update directly
      const now = Math.floor(Date.now() / 1000)
      db.update(sessions)
        .set({ status: 'completed', finished_at: now })
        .where(eq(sessions.id, sessionId))
        .run()

      emitToProject(projectId, 'session:lifecycle', {
        session: { ...session, status: 'completed', finished_at: now },
        action: 'completed',
      })
    }

    const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    res.json({ session: updated })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/message — send follow-up message to idle/running session
const MAX_ATTACHMENT_SIZE = 5_000_000 // ~3.75MB decoded from base64
const MAX_ATTACHMENTS = 10

const messageSchema = z.object({
  message: z.string().min(1),
  attachments: z.array(z.object({
    type: z.enum(['image', 'file']),
    name: z.string().max(500),
    mimeType: z.string().max(200),
    data: z.string().max(MAX_ATTACHMENT_SIZE), // base64, ~3.75MB decoded
  })).max(MAX_ATTACHMENTS).optional(),
})

router.post('/:sessionId/message', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const parsed = messageSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (!['idle', 'running', 'waiting_input'].includes(session.status)) {
      res.status(400).json({ error: `Cannot send message to session in ${session.status} status` })
      return
    }

    const runner = getSessionRunner()
    const sent = runner?.sendMessage(
      sessionId,
      parsed.data.message,
      parsed.data.attachments as Attachment[] | undefined,
    )

    if (!sent) {
      // Fallback: emit via Socket.IO
      emitToSession(sessionId, 'session:message', {
        session_id: sessionId,
        message: parsed.data.message,
      })
    }

    res.json({ status: 'message_sent' })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/permission-mode — change permission mode (persisted, takes effect on next resume)
router.post('/:sessionId/permission-mode', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const parsed = z.object({
      mode: z.enum(['default', 'plan', 'acceptEdits', 'bypassPermissions']),
    }).safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // Permission mode gating: check project safety_mode
    let effectiveMode = parsed.data.mode
    if (effectiveMode === 'bypassPermissions') {
      const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
      const user = req.user!
      if (project?.safety_mode === 'b' && user.role !== 'techlead') {
        effectiveMode = 'acceptEdits'
      }
    }

    // Always persist in DB directly, then also update managed session if runner exists
    db.update(sessions)
      .set({ permission_mode: effectiveMode as typeof sessions.$inferInsert['permission_mode'] })
      .where(eq(sessions.id, sessionId))
      .run()

    const runner = getSessionRunner()
    if (runner) {
      const managed = runner.getManaged(sessionId)
      if (managed) managed.permissionMode = effectiveMode
    }

    emitToSession(sessionId, 'session:permission-mode', {
      session_id: sessionId,
      mode: effectiveMode,
    })

    res.json({ status: 'permission_mode_updated', mode: effectiveMode })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// DELETE /:sessionId — delete single session + its events
router.delete('/:sessionId', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')
    const user = req.user!

    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    if (!canMutateSession(user, session.user_id)) {
      res.status(403).json({ error: 'Only the session owner or techlead can delete sessions' })
      return
    }

    // Prevent deleting active sessions — cancel or interrupt first
    if (['running', 'waiting_input'].includes(session.status)) {
      res.status(400).json({ error: 'Cannot delete a running session. Cancel or interrupt first.' })
      return
    }

    const runner = getSessionRunner()
    const deleted = runner?.deleteSession(sessionId)

    if (!deleted) {
      // Runner didn't handle it — delete directly
      db.delete(sessionEvents).where(eq(sessionEvents.session_id, sessionId)).run()
      db.delete(sessions).where(eq(sessions.id, sessionId)).run()
      emitToProject(projectId, 'session:lifecycle', {
        session: { id: sessionId, status: 'deleted' },
        action: 'deleted',
      })
    }

    res.json({ status: 'deleted', sessionId })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// DELETE / — bulk delete completed/failed/cancelled sessions
router.delete('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')

    const runner = getSessionRunner()
    const result = runner?.bulkDeleteSessions(projectId)

    if (!result) {
      // Fallback: delete directly
      const terminal = db
        .select()
        .from(sessions)
        .where(eq(sessions.project_id, projectId))
        .all()
        .filter((s) => ['completed', 'failed', 'cancelled'].includes(s.status))

      for (const session of terminal) {
        db.delete(sessionEvents).where(eq(sessionEvents.session_id, session.id)).run()
        db.delete(sessions).where(eq(sessions.id, session.id)).run()
      }

      res.json({ deleted: terminal.length, historyDeleted: 0 })
      return
    }

    res.json(result)
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// GET /:sessionId/events — list session events
router.get('/:sessionId/events', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000)
    const afterId = parseInt(req.query.after_id as string) || 0

    // Verify session belongs to project
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    const rows = db
      .select()
      .from(sessionEvents)
      .where(
        afterId > 0
          ? and(eq(sessionEvents.session_id, sessionId), gt(sessionEvents.id, afterId))
          : eq(sessionEvents.session_id, sessionId),
      )
      .orderBy(sessionEvents.id)
      .limit(limit)
      .all()

    // Parse event data
    const events = rows.map(row => ({
      ...row,
      data: JSON.parse(row.data),
    }))

    res.json({ events })
  } catch (err) {
      res.status(500).json({ error: logError('sessions', err) })
  }
})

// GET /:sessionId/audit — session audit log (tool call tracking)
router.get('/:sessionId/audit', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000)
    const offset = parseInt(req.query.offset as string) || 0

    // Verify session belongs to project
    const session = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.project_id, projectId)))
      .get()

    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    const rows = db
      .select()
      .from(sessionAuditLog)
      .where(eq(sessionAuditLog.session_id, sessionId))
      .orderBy(desc(sessionAuditLog.created_at))
      .limit(limit)
      .offset(offset)
      .all()

    res.json({ audit: rows, total: rows.length })
  } catch (err) {
    res.status(500).json({ error: logError('sessions/audit', err) })
  }
})

export default router
