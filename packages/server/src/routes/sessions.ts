import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and, desc, gt } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { sessions, sessionEvents } from '../db/schema.js'
import { agentService } from '../services/agent-service.js'

function safeJsonParse(str: string): unknown {
  try { return JSON.parse(str) } catch { return str }
}

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

// ── Schemas ──────────────────────────────────────────────────────────────────

const createSessionSchema = z.object({
  epic_id: z.string().optional(),
  model: z.enum(['sonnet', 'opus', 'haiku']).default('sonnet'),
  prompt: z.string().min(1).max(10000),
})

const answerSchema = z.object({
  answer: z.string().min(1),
})

const resumeSchema = z.object({
  prompt: z.string().min(1).max(10000),
})

// ── GET /api/projects/:projectId/sessions ────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const status = req.query.status as string | undefined
    const epicId = req.query.epic_id as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const offset = parseInt(req.query.offset as string) || 0

    // Build composable filter conditions
    const conditions = [eq(sessions.project_id, projectId)]
    if (status) {
      conditions.push(eq(sessions.status, status as typeof sessions.status._.data))
    }
    if (epicId) {
      conditions.push(eq(sessions.epic_id, epicId))
    }

    const results = db.select()
      .from(sessions)
      .where(and(...conditions))
      .orderBy(desc(sessions.created_at))
      .limit(limit)
      .offset(offset)
      .all()

    res.json({ sessions: results })
  } catch (err) {
    res.status(500).json({ error: `Failed to list sessions: ${(err as Error).message}` })
  }
})

// ── POST /api/projects/:projectId/sessions ───────────────────────────────────

router.post('/', requireRole('pm', 'dev', 'techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const parsed = createSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const { epic_id, model, prompt } = parsed.data

    const result = await agentService.spawn({
      projectId,
      epicId: epic_id,
      userId: req.user!.id,
      prompt,
      model,
    })

    const statusCode = result.status === 'queued' ? 202 : 201
    res.status(statusCode).json({ session: result })
  } catch (err) {
    res.status(500).json({ error: `Failed to create session: ${(err as Error).message}` })
  }
})

// ── GET /api/sessions/:sessionId ─────────────────────────────────────────────

router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // Get event count and last event preview
    const eventCount = db.select({ id: sessionEvents.id })
      .from(sessionEvents)
      .where(eq(sessionEvents.session_id, sessionId))
      .all()

    const lastEvent = db.select()
      .from(sessionEvents)
      .where(eq(sessionEvents.session_id, sessionId))
      .orderBy(desc(sessionEvents.id))
      .limit(1)
      .get()

    res.json({
      session: {
        ...session,
        event_count: eventCount.length,
        last_event: lastEvent ? safeJsonParse(lastEvent.data) : null,
      },
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to get session: ${(err as Error).message}` })
  }
})

// ── POST /api/sessions/:sessionId/cancel ─────────────────────────────────────

router.post('/:sessionId/cancel', requireRole('pm', 'dev', 'techlead'), async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }

    // Only session owner, PM, or TechLead can cancel
    const user = req.user!
    if (session.user_id !== user.id && user.role !== 'pm' && user.role !== 'techlead') {
      res.status(403).json({ error: 'Only the session owner, PM, or TechLead can cancel' })
      return
    }

    const cancelled = agentService.cancel(sessionId)
    if (!cancelled) {
      res.status(400).json({ error: 'Session cannot be cancelled (not running)' })
      return
    }

    res.json({ session: { id: sessionId, status: 'cancelled' } })
  } catch (err) {
    res.status(500).json({ error: `Failed to cancel session: ${(err as Error).message}` })
  }
})

// ── POST /api/sessions/:sessionId/resume ─────────────────────────────────────

router.post('/:sessionId/resume', requireRole('pm', 'dev', 'techlead'), async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>
    const parsed = resumeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const resumed = await agentService.resume(sessionId, parsed.data.prompt)
    if (!resumed) {
      res.status(400).json({ error: 'Session cannot be resumed (no claude_session_id or invalid status)' })
      return
    }

    res.json({ session: { id: sessionId, status: 'running' } })
  } catch (err) {
    res.status(500).json({ error: `Failed to resume session: ${(err as Error).message}` })
  }
})

// ── POST /api/sessions/:sessionId/answer ─────────────────────────────────────

router.post('/:sessionId/answer', async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>
    const parsed = answerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const answered = agentService.answer(sessionId, parsed.data.answer)
    if (!answered) {
      res.status(400).json({ error: 'No pending question for this session' })
      return
    }

    res.json({ session: { id: sessionId, status: 'running' } })
  } catch (err) {
    res.status(500).json({ error: `Failed to answer question: ${(err as Error).message}` })
  }
})

// ── GET /api/sessions/:sessionId/events ──────────────────────────────────────

router.get('/:sessionId/events', async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>
    const afterId = parseInt(req.query.after_id as string) || 0
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500)
    const eventType = req.query.event_type as string | undefined

    let baseQuery = db.select()
      .from(sessionEvents)
      .where(
        afterId > 0
          ? and(eq(sessionEvents.session_id, sessionId), gt(sessionEvents.id, afterId))
          : eq(sessionEvents.session_id, sessionId)
      )

    if (eventType) {
      baseQuery = db.select()
        .from(sessionEvents)
        .where(
          and(
            eq(sessionEvents.session_id, sessionId),
            eq(sessionEvents.event_type, eventType as typeof sessionEvents.event_type._.data),
            afterId > 0 ? gt(sessionEvents.id, afterId) : undefined,
          )
        )
    }

    const events = baseQuery
      .orderBy(sessionEvents.id)
      .limit(limit + 1) // Fetch one extra to check has_more
      .all()

    const hasMore = events.length > limit
    const returnedEvents = hasMore ? events.slice(0, limit) : events

    res.json({
      events: returnedEvents.map((e) => ({
        ...e,
        data: safeJsonParse(e.data),
      })),
      has_more: hasMore,
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to get events: ${(err as Error).message}` })
  }
})

export default router
