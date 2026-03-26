import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { notifications } from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'
import { emitToUser } from '../services/socket-manager.js'
import { logError } from '../utils/log-error.js'

// Mounted at /api/notifications (user-scoped, not project-scoped)
const router: RouterType = Router()

router.use(authenticate)

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list user notifications
router.get('/', (req, res) => {
  try {
    const user = req.user!
    const readFilter = req.query.read as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)

    const whereClause = readFilter !== undefined
      ? and(eq(notifications.user_id, user.id), eq(notifications.read, readFilter === 'true' ? 1 : 0))
      : eq(notifications.user_id, user.id)

    const rows = db
      .select()
      .from(notifications)
      .where(whereClause)
      .orderBy(desc(notifications.created_at))
      .limit(limit)
      .all()

    const enriched = rows.map(row => ({
      ...row,
      read: Boolean(row.read),
    }))

    res.json({ notifications: enriched })
  } catch (err) {
      res.status(500).json({ error: logError('notifications', err) })
  }
})

// PATCH /:notificationId — mark as read
router.patch('/:notificationId', (req, res) => {
  try {
    const user = req.user!
    const notificationId = param(req, 'notificationId')

    const existing = db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, notificationId), eq(notifications.user_id, user.id)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Notification not found' })
      return
    }

    db.update(notifications)
      .set({ read: 1 })
      .where(eq(notifications.id, notificationId))
      .run()

    emitToUser(user.id, 'notification:read', { id: notificationId })
    res.json({ notification: { ...existing, read: true } })
  } catch (err) {
      res.status(500).json({ error: logError('notifications', err) })
  }
})

// POST /mark-all-read — mark all as read
router.post('/mark-all-read', (req, res) => {
  try {
    const user = req.user!

    db.update(notifications)
      .set({ read: 1 })
      .where(and(eq(notifications.user_id, user.id), eq(notifications.read, 0)))
      .run()

    emitToUser(user.id, 'notification:all-read', {})
    res.json({ status: 'ok' })
  } catch (err) {
      res.status(500).json({ error: logError('notifications', err) })
  }
})

export default router
