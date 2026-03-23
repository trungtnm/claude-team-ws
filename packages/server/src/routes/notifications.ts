import { Router } from 'express'
import type { Request, Response } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'

const router = Router()
router.use(authenticate)

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id
    const unreadOnly = req.query.unread_only === 'true'

    const conditions = [eq(schema.notifications.user_id, userId)]
    if (unreadOnly) {
      conditions.push(eq(schema.notifications.read, 0))
    }

    const results = db
      .select()
      .from(schema.notifications)
      .where(and(...conditions))
      .orderBy(desc(schema.notifications.created_at))
      .all()

    res.json({ notifications: results })
  } catch (error) {
    console.error('Lỗi khi lấy thông báo:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

// IMPORTANT: /read-all must be defined before /:id/read to avoid route conflicts
router.patch('/read-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id

    db.update(schema.notifications)
      .set({ read: 1 })
      .where(and(eq(schema.notifications.user_id, userId), eq(schema.notifications.read, 0)))
      .run()

    res.json({ message: 'Đã đánh dấu tất cả đã đọc' })
  } catch (error) {
    console.error('Lỗi khi đánh dấu tất cả thông báo:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.patch('/:id/read', async (req: Request, res: Response): Promise<void> => {
  try {
    const notificationId = req.params.id as string
    const userId = req.user!.id

    const existing = db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.id, notificationId), eq(schema.notifications.user_id, userId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy thông báo' })
      return
    }

    db.update(schema.notifications)
      .set({ read: 1 })
      .where(eq(schema.notifications.id, notificationId))
      .run()

    res.json({ message: 'Đã đánh dấu đã đọc' })
  } catch (error) {
    console.error('Lỗi khi đánh dấu thông báo:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

export default router
