import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { sessions, sessionEvents, projects, activityLog } from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject, emitToSession } from '../services/socket-manager.js'
import { getSessionRunner } from '../services/session-runner.js'
import { logError } from '../utils/log-error.js'

// Mounted at /api/projects/:projectId/sessions
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

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
    const { epic_id, name, prompt, model } = parsed.data

    // Check concurrency limits
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
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

// POST /:sessionId/cancel — cancel running session
router.post('/:sessionId/cancel', (req, res) => {
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

    if (session.status !== 'running' && session.status !== 'queued' && session.status !== 'waiting_input') {
      res.status(400).json({ error: `Cannot cancel session in ${session.status} status` })
      return
    }

    // Try to cancel via session runner (which also aborts the SDK process)
    const runner = getSessionRunner()
    const cancelledViaRunner = runner?.cancelSession(sessionId)

    if (!cancelledViaRunner) {
      // Session not managed by runner (e.g., still queued) — update DB directly
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

    if (session.status !== 'queued' && session.status !== 'running') {
      res.status(400).json({ error: `Cannot complete session in ${session.status} status` })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    db.update(sessions)
      .set({ status: 'completed', finished_at: now })
      .where(eq(sessions.id, sessionId))
      .run()

    const updated = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    emitToProject(projectId, 'session:lifecycle', { session: updated, action: 'completed' })
    res.json({ session: updated })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/message — send follow-up message to running session
router.post('/:sessionId/message', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const sessionId = param(req, 'sessionId')

    const parsed = z.object({ message: z.string().min(1) }).safeParse(req.body)
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

    // Emit message to session room for the runner to pick up
    emitToSession(sessionId, 'session:message', {
      session_id: sessionId,
      message: parsed.data.message,
    })

    res.json({ status: 'message_sent' })
  } catch (err) {
    res.status(500).json({ error: logError('sessions', err) })
  }
})

// POST /:sessionId/permission-mode — change permission mode
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

    // Emit permission mode change to session room for runner to pick up
    emitToSession(sessionId, 'session:permission-mode', {
      session_id: sessionId,
      mode: parsed.data.mode,
    })

    res.json({ status: 'permission_mode_updated', mode: parsed.data.mode })
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

export default router
