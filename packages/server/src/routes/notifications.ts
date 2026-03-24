import { Router, type Router as RouterType } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { authenticate } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { emitToUser } from '../services/socket-manager.js'

const router: RouterType = Router()
router.use(authenticate)

// GET /api/notifications
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id
    const unreadOnly = req.query.unread === 'true'
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)

    let results
    if (unreadOnly) {
      results = db.select()
        .from(notifications)
        .where(and(eq(notifications.user_id, userId), eq(notifications.read, 0)))
        .orderBy(desc(notifications.created_at))
        .limit(limit)
        .all()
    } else {
      results = db.select()
        .from(notifications)
        .where(eq(notifications.user_id, userId))
        .orderBy(desc(notifications.created_at))
        .limit(limit)
        .all()
    }

    const unreadCount = db.select()
      .from(notifications)
      .where(and(eq(notifications.user_id, userId), eq(notifications.read, 0)))
      .all()
      .length

    res.json({ notifications: results, unread_count: unreadCount })
  } catch (err) {
    res.status(500).json({ error: `Failed to list notifications: ${(err as Error).message}` })
  }
})

// POST /api/notifications/mark-all-read — MUST be before /:notificationId to avoid shadowing
router.post('/mark-all-read', async (req, res) => {
  try {
    const userId = req.user!.id

    db.update(notifications)
      .set({ read: 1 })
      .where(and(eq(notifications.user_id, userId), eq(notifications.read, 0)))
      .run()

    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: `Failed to mark all read: ${(err as Error).message}` })
  }
})

// POST /api/notifications/:notificationId/read
router.post('/:notificationId/read', async (req, res) => {
  try {
    const { notificationId } = req.params as Record<string, string>

    const notification = db.select().from(notifications).where(eq(notifications.id, notificationId)).get()
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' })
      return
    }
    if (notification.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Not your notification' })
      return
    }

    db.update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.id, notificationId))
      .run()

    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: `Failed to mark read: ${(err as Error).message}` })
  }
})

export default router

// ── Helper for creating notifications from services ──────────────────────────

export function createNotification(opts: {
  userId: string
  projectId: string
  type: 'agent_complete' | 'pr_ready' | 'review_needed' | 'question_waiting' | 'merge_complete'
  title: string
  body?: string
  link?: string
}): void {
  const id = nanoid(12)

  db.insert(notifications).values({
    id,
    user_id: opts.userId,
    project_id: opts.projectId,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? null,
    link: opts.link ?? null,
  }).run()

  emitToUser(opts.userId, 'notification', {
    id,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    link: opts.link,
  })
}
