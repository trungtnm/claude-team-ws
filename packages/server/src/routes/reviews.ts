import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, isNotNull, desc } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { sessions, activityLog } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import { GhService } from '../services/gh-service.js'
import { logError } from '../utils/log-error.js'

// Mounted at /api/projects/:projectId/reviews
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

const ghService = new GhService(process.cwd())

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list reviews for project (sessions with pr_url)
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')

    const rows = db
      .select()
      .from(sessions)
      .where(and(eq(sessions.project_id, projectId), isNotNull(sessions.pr_url)))
      .orderBy(desc(sessions.created_at))
      .all()

    res.json({ reviews: rows })
  } catch (err) {
      res.status(500).json({ error: logError('reviews', err) })
  }
})

// GET /:sessionId — review detail
router.get('/:sessionId', async (req, res) => {
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

    if (!session.pr_url) {
      res.status(404).json({ error: 'Session has no associated PR' })
      return
    }

    // Fetch PR details from GitHub
    let prData: Record<string, unknown> | null = null
    let prDiff: string | null = null
    try {
      prData = await ghService.getPr(session.pr_url)
      prDiff = await ghService.getPrDiff(session.pr_url)
    } catch {
      // GitHub may be unavailable
    }

    res.json({
      review: {
        session,
        pr: prData,
        diff: prDiff,
      },
    })
  } catch (err) {
      res.status(500).json({ error: logError('reviews', err) })
  }
})

const commentSchema = z.object({
  body: z.string().min(1).max(10000),
})

// POST /:sessionId/comment — add comment
router.post('/:sessionId/comment', async (req, res) => {
  try {
    const parsed = commentSchema.safeParse(req.body)
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

    if (!session.pr_url) {
      res.status(400).json({ error: 'Session has no associated PR' })
      return
    }

    await ghService.addPrComment(session.pr_url, parsed.data.body)

    emitToProject(projectId, 'pr:event', {
      session_id: sessionId,
      action: 'comment_added',
      pr_url: session.pr_url,
    })

    res.status(201).json({ status: 'comment_added' })
  } catch (err) {
      res.status(500).json({ error: logError('reviews', err) })
  }
})

const mergeSchema = z.object({
  strategy: z.enum(['squash', 'merge', 'rebase']).optional(),
})

// POST /:sessionId/merge — merge PR
router.post('/:sessionId/merge', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const parsed = mergeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

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

    if (!session.pr_url) {
      res.status(400).json({ error: 'Session has no associated PR' })
      return
    }

    const strategy = parsed.data.strategy ?? 'squash'
    await ghService.mergePr(session.pr_url, strategy)

    // Update session PR status
    db.update(sessions)
      .set({ pr_status: 'merged' })
      .where(eq(sessions.id, sessionId))
      .run()

    // Log activity
    const now = Math.floor(Date.now() / 1000)
    db.insert(activityLog).values({
      project_id: projectId,
      user_id: user.id,
      action: 'pr_merged',
      details: JSON.stringify({ session_id: sessionId, pr_url: session.pr_url, strategy }),
      created_at: now,
    }).run()

    emitToProject(projectId, 'pr:event', {
      session_id: sessionId,
      action: 'merged',
      pr_url: session.pr_url,
      strategy,
    })

    res.json({ status: 'merged' })
  } catch (err) {
      res.status(500).json({ error: logError('reviews', err) })
  }
})

export default router
