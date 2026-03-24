import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { sessions, epics, projects, activityLog } from '../db/schema.js'
import { ghService } from '../services/gh-service.js'
import { BeadsService } from '../services/beads-service.js'
import { emitToProject } from '../services/socket-manager.js'

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

// ── Schemas ──────────────────────────────────────────────────────────────────

const commentSchema = z.object({
  file: z.string().optional(),
  line: z.number().optional(),
  body: z.string().min(1),
})

const mergeSchema = z.object({
  strategy: z.enum(['squash', 'merge', 'rebase']).default('squash'),
})

// ── GET /api/projects/:projectId/reviews ─────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId

    const reviewSessions = db.select()
      .from(sessions)
      .where(and(
        eq(sessions.project_id, projectId),
        eq(sessions.status, 'completed'),
      ))
      .all()
      .filter((s) => s.pr_url)

    res.json({
      reviews: reviewSessions.map((s) => ({
        session_id: s.id,
        epic_id: s.epic_id,
        pr_url: s.pr_url,
        pr_status: s.pr_status,
        model: s.model,
        created_at: s.created_at,
        finished_at: s.finished_at,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to list reviews: ${(err as Error).message}` })
  }
})

// ── GET /api/reviews/:sessionId ──────────────────────────────────────────────

router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      res.status(404).json({ error: 'Session not found' })
      return
    }
    if (!session.pr_url) {
      res.status(404).json({ error: 'Session has no PR' })
      return
    }

    // Fetch PR data from GitHub
    const [prInfo, prFiles, prComments] = await Promise.all([
      ghService.getPr(session.pr_url),
      ghService.getPrFiles(session.pr_url),
      ghService.getPrComments(session.pr_url),
    ])

    res.json({
      pr: {
        url: prInfo.url,
        number: prInfo.number,
        title: prInfo.title,
        state: prInfo.state,
        branch: prInfo.headBranch,
        additions: prInfo.additions,
        deletions: prInfo.deletions,
      },
      diff: { files: prFiles },
      human_comments: prComments,
      session: {
        id: session.id,
        epic_id: session.epic_id,
        pr_status: session.pr_status,
      },
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to get review: ${(err as Error).message}` })
  }
})

// ── POST /api/reviews/:sessionId/comment ─────────────────────────────────────

router.post('/:sessionId/comment', requireRole('pm', 'dev', 'techlead'), async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>
    const parsed = commentSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session?.pr_url) {
      res.status(404).json({ error: 'Session has no PR' })
      return
    }

    const { file, line, body } = parsed.data

    // Format comment body with file/line reference
    let commentBody = body
    if (file) {
      commentBody = line
        ? `**${file}:${line}**\n\n${body}`
        : `**${file}**\n\n${body}`
    }

    await ghService.addComment(session.pr_url, commentBody)

    // Update PR status to changes_requested
    db.update(sessions)
      .set({ pr_status: 'changes_requested' })
      .where(eq(sessions.id, sessionId))
      .run()

    emitToProject(session.project_id, 'pr:event', {
      sessionId,
      action: 'comment_added',
      pr_url: session.pr_url,
    })

    res.json({ status: 'ok', message: 'Comment added' })
  } catch (err) {
    res.status(500).json({ error: `Failed to add comment: ${(err as Error).message}` })
  }
})

// ── POST /api/reviews/:sessionId/merge ───────────────────────────────────────

router.post('/:sessionId/merge', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const { sessionId } = req.params as Record<string, string>
    const parsed = mergeSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session?.pr_url) {
      res.status(404).json({ error: 'Session has no PR' })
      return
    }

    // 1. Merge PR
    await ghService.merge(session.pr_url, parsed.data.strategy)

    // 2. Update session PR status
    db.update(sessions)
      .set({ pr_status: 'merged' })
      .where(eq(sessions.id, sessionId))
      .run()

    // 3. Update epic status to done
    if (session.epic_id) {
      const epic = db.select().from(epics).where(eq(epics.id, session.epic_id)).get()
      if (epic) {
        db.update(epics)
          .set({ ui_status: 'done', updated_at: Math.floor(Date.now() / 1000) })
          .where(eq(epics.id, session.epic_id))
          .run()

        // 4. Close bead in br — use project's root, not global env
        try {
          const project = db.select().from(projects).where(eq(projects.id, session.project_id)).get()
          const projectRoot = project?.project_root || process.env.PROJECT_ROOT || '.'
          const beadsService = new BeadsService(projectRoot)
          await beadsService.close(epic.bead_epic_id, `Merged PR ${session.pr_url}`)
          await beadsService.sync()
        } catch {
          // Non-critical — bead close failure shouldn't block merge
        }
      }
    }

    // 5. Log activity
    db.insert(activityLog).values({
      project_id: session.project_id,
      user_id: req.user!.id,
      action: 'pr_merged',
      details: JSON.stringify({ session_id: sessionId, pr_url: session.pr_url }),
    }).run()

    // 6. Emit events
    emitToProject(session.project_id, 'pr:event', {
      sessionId,
      action: 'merged',
      pr_url: session.pr_url,
    })

    res.json({ status: 'ok', message: 'PR merged successfully' })
  } catch (err) {
    res.status(500).json({ error: `Failed to merge PR: ${(err as Error).message}` })
  }
})

export default router
