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

const createCaptureSchema = z.object({
  project_id: z.string().min(1),
  text: z.string().min(1),
})

const updateCaptureSchema = z.object({
  status: z.enum(['pending', 'triaged', 'deferred', 'dismissed']),
  triage_result: z.string().optional(),
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.query.project_id as string | undefined
    if (!projectId) {
      res.status(400).json({ error: 'Thiếu project_id' })
      return
    }

    const statusFilter = req.query.status as string | undefined
    const conditions = [eq(schema.captures.project_id, projectId)]
    if (statusFilter) {
      conditions.push(eq(schema.captures.status, statusFilter as 'pending' | 'triaged' | 'deferred' | 'dismissed'))
    }

    const results = db
      .select()
      .from(schema.captures)
      .where(and(...conditions))
      .orderBy(desc(schema.captures.created_at))
      .all()

    res.json({ captures: results })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách capture:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.post('/', requireRole('pm', 'dev', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createCaptureSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const captureId = nanoid()
    const userId = req.user!.id

    db.insert(schema.captures).values({
      id: captureId,
      project_id: parsed.data.project_id,
      user_id: userId,
      text: parsed.data.text,
      status: 'pending',
    }).run()

    const capture = db
      .select()
      .from(schema.captures)
      .where(eq(schema.captures.id, captureId))
      .get()

    res.status(201).json({ capture })
  } catch (error) {
    console.error('Lỗi khi tạo capture:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.patch('/:id', requireRole('pm', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = updateCaptureSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const captureId = req.params.id as string
    const existing = db.select().from(schema.captures).where(eq(schema.captures.id, captureId)).get()
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy capture' })
      return
    }

    const updateData: Record<string, unknown> = {
      status: parsed.data.status,
      triaged_by: req.user!.id,
      triaged_at: Math.floor(Date.now() / 1000),
    }
    if (parsed.data.triage_result !== undefined) {
      updateData.triage_result = parsed.data.triage_result
    }

    db.update(schema.captures)
      .set(updateData)
      .where(eq(schema.captures.id, captureId))
      .run()

    const updated = db.select().from(schema.captures).where(eq(schema.captures.id, captureId)).get()
    res.json({ capture: updated })
  } catch (error) {
    console.error('Lỗi khi cập nhật capture:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.delete('/:id', requireRole('pm', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const captureId = req.params.id as string
    const existing = db.select().from(schema.captures).where(eq(schema.captures.id, captureId)).get()
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy capture' })
      return
    }

    db.update(schema.captures)
      .set({ status: 'dismissed' as const })
      .where(eq(schema.captures.id, captureId))
      .run()

    res.json({ message: 'Đã loại bỏ capture' })
  } catch (error) {
    console.error('Lỗi khi xoá capture:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

export default router
