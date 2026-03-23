import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

const createEpicSchema = z.object({
  project_id: z.string().min(1),
  bead_epic_id: z.string().min(1),
})

const updateEpicSchema = z.object({
  ui_status: z.enum(['draft', 'ready', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
  git_branches: z.string().optional(),
  scope_analysis: z.string().nullable().optional(),
  split_proposal: z.string().nullable().optional(),
})

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.query.project_id as string | undefined
    if (!projectId) {
      res.status(400).json({ error: 'Thiếu project_id' })
      return
    }

    const results = db
      .select()
      .from(schema.epics)
      .where(eq(schema.epics.project_id, projectId))
      .orderBy(desc(schema.epics.created_at))
      .all()

    res.json({ epics: results })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách epic:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.post('/', requireRole('pm', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createEpicSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const epicId = nanoid()

    db.insert(schema.epics).values({
      id: epicId,
      project_id: parsed.data.project_id,
      bead_epic_id: parsed.data.bead_epic_id,
    }).run()

    const epic = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get()
    res.status(201).json({ epic })
  } catch (error) {
    console.error('Lỗi khi tạo epic:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = updateEpicSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const epicId = req.params.id as string
    const existing = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get()
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy epic' })
      return
    }

    const updateData: Record<string, unknown> = {
      updated_at: Math.floor(Date.now() / 1000),
    }
    if (parsed.data.ui_status !== undefined) updateData.ui_status = parsed.data.ui_status
    if (parsed.data.git_branches !== undefined) updateData.git_branches = parsed.data.git_branches
    if (parsed.data.scope_analysis !== undefined) updateData.scope_analysis = parsed.data.scope_analysis
    if (parsed.data.split_proposal !== undefined) updateData.split_proposal = parsed.data.split_proposal

    db.update(schema.epics)
      .set(updateData)
      .where(eq(schema.epics.id, epicId))
      .run()

    const updated = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get()
    res.json({ epic: updated })
  } catch (error) {
    console.error('Lỗi khi cập nhật epic:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const epicId = req.params.id as string
    const epic = db.select().from(schema.epics).where(eq(schema.epics.id, epicId)).get()
    if (!epic) {
      res.status(404).json({ error: 'Không tìm thấy epic' })
      return
    }

    res.json({ epic })
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết epic:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

export default router
