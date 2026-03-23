import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

const createSessionSchema = z.object({
  project_id: z.string().min(1),
  epic_id: z.string().optional(),
  prompt: z.string().min(1),
  model: z.string().default('sonnet'),
})

const answerSchema = z.object({
  answer: z.string().min(1),
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.query.project_id as string | undefined
    if (!projectId) {
      res.status(400).json({ error: 'Thiếu project_id' })
      return
    }

    const statusFilter = req.query.status as string | undefined
    const conditions = [eq(schema.sessions.project_id, projectId)]
    if (statusFilter) {
      conditions.push(
        eq(
          schema.sessions.status,
          statusFilter as 'queued' | 'running' | 'waiting_input' | 'validation_failed' | 'completed' | 'failed' | 'cancelled' | 'detached',
        ),
      )
    }

    const results = db
      .select()
      .from(schema.sessions)
      .where(and(...conditions))
      .orderBy(desc(schema.sessions.created_at))
      .all()

    res.json({ sessions: results })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách phiên:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.post('/', requireRole('pm', 'dev', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createSessionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const sessionId = nanoid()
    const userId = req.user!.id

    db.insert(schema.sessions).values({
      id: sessionId,
      project_id: parsed.data.project_id,
      epic_id: parsed.data.epic_id,
      user_id: userId,
      prompt: parsed.data.prompt,
      model: parsed.data.model,
      status: 'queued',
    }).run()

    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()
    res.status(201).json({ session })
  } catch (error) {
    console.error('Lỗi khi tạo phiên:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id as string
    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()
    if (!session) {
      res.status(404).json({ error: 'Không tìm thấy phiên' })
      return
    }

    const events = db
      .select()
      .from(schema.sessionEvents)
      .where(eq(schema.sessionEvents.session_id, sessionId))
      .orderBy(desc(schema.sessionEvents.created_at))
      .limit(50)
      .all()

    res.json({ session, events })
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết phiên:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.post('/:id/answer', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = answerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const sessionId = req.params.id as string
    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()
    if (!session) {
      res.status(404).json({ error: 'Không tìm thấy phiên' })
      return
    }

    if (session.status !== 'waiting_input') {
      res.status(409).json({ error: 'Phiên không đang chờ phản hồi' })
      return
    }

    // Store the answer as a session event
    db.insert(schema.sessionEvents).values({
      session_id: sessionId,
      event_type: 'system',
      data: JSON.stringify({ type: 'user_answer', answer: parsed.data.answer }),
    }).run()

    db.update(schema.sessions)
      .set({ status: 'running' as const })
      .where(eq(schema.sessions.id, sessionId))
      .run()

    res.json({ message: 'Đã gửi câu trả lời' })
  } catch (error) {
    console.error('Lỗi khi gửi câu trả lời:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.post('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id as string
    const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()
    if (!session) {
      res.status(404).json({ error: 'Không tìm thấy phiên' })
      return
    }

    const cancellableStatuses = ['queued', 'running', 'waiting_input']
    if (!cancellableStatuses.includes(session.status)) {
      res.status(409).json({ error: 'Không thể huỷ phiên ở trạng thái hiện tại' })
      return
    }

    db.update(schema.sessions)
      .set({
        status: 'cancelled' as const,
        finished_at: Math.floor(Date.now() / 1000),
      })
      .where(eq(schema.sessions.id, sessionId))
      .run()

    res.json({ message: 'Đã huỷ phiên' })
  } catch (error) {
    console.error('Lỗi khi huỷ phiên:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

export default router
