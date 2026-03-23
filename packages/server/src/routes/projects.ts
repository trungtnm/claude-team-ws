import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
// @ts-expect-error -- slug has no type declarations
import slug from 'slug'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'

const router = Router()
router.use(authenticate)

const createProjectSchema = z.object({
  name: z.string().min(1),
  project_root: z.string().min(1),
  max_concurrent_agents: z.number().int().min(1).max(10).default(3),
  ask_question_mode: z.enum(['pause', 'auto', 'hybrid']).default('hybrid'),
})

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  max_concurrent_agents: z.number().int().min(1).max(10).optional(),
  ask_question_mode: z.enum(['pause', 'auto', 'hybrid']).optional(),
})

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const results = db
      .select()
      .from(schema.projects)
      .orderBy(desc(schema.projects.created_at))
      .all()

    res.json({ projects: results })
  } catch (error) {
    console.error('Lỗi khi lấy danh sách dự án:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.post('/', requireRole('pm', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const projectId = nanoid()
    const projectSlug = slug(parsed.data.name)

    db.insert(schema.projects).values({
      id: projectId,
      name: parsed.data.name,
      slug: projectSlug,
      project_root: parsed.data.project_root,
      max_concurrent_agents: parsed.data.max_concurrent_agents,
      ask_question_mode: parsed.data.ask_question_mode,
    }).run()

    const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
    res.status(201).json({ project })
  } catch (error) {
    console.error('Lỗi khi tạo dự án:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const projectId = req.params.id as string
    const project = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
    if (!project) {
      res.status(404).json({ error: 'Không tìm thấy dự án' })
      return
    }

    res.json({ project })
  } catch (error) {
    console.error('Lỗi khi lấy chi tiết dự án:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

router.patch('/:id', requireRole('pm', 'techlead'), async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Dữ liệu không hợp lệ', details: parsed.error.issues })
      return
    }

    const projectId = req.params.id as string
    const existing = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
    if (!existing) {
      res.status(404).json({ error: 'Không tìm thấy dự án' })
      return
    }

    const updateData: Record<string, unknown> = {
      updated_at: Math.floor(Date.now() / 1000),
    }
    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name
      updateData.slug = slug(parsed.data.name)
    }
    if (parsed.data.max_concurrent_agents !== undefined) {
      updateData.max_concurrent_agents = parsed.data.max_concurrent_agents
    }
    if (parsed.data.ask_question_mode !== undefined) {
      updateData.ask_question_mode = parsed.data.ask_question_mode
    }

    db.update(schema.projects)
      .set(updateData)
      .where(eq(schema.projects.id, projectId))
      .run()

    const updated = db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).get()
    res.json({ project: updated })
  } catch (error) {
    console.error('Lỗi khi cập nhật dự án:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

export default router
