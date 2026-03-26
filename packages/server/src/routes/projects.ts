import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { projects, projectMembers } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { emitToProject } from '../services/socket-manager.js'
import { logError } from '../utils/log-error.js'

const router: RouterType = Router()

router.use(authenticate)

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list all projects the current user has access to
router.get('/', (req, res) => {
  try {
    const user = req.user!

    const rows = db
      .select({
        id: projects.id,
        name: projects.name,
        slug: projects.slug,
        project_root: projects.project_root,
        max_concurrent_agents: projects.max_concurrent_agents,
        ask_question_mode: projects.ask_question_mode,
        created_at: projects.created_at,
        updated_at: projects.updated_at,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projects.id, projectMembers.project_id))
      .where(eq(projectMembers.user_id, user.id))
      .all()

    res.json({ projects: rows })
  } catch (err) {
      res.status(500).json({ error: logError('projects', err) })
  }
})

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  project_root: z.string().min(1),
  max_concurrent_agents: z.number().int().min(1).max(20).optional(),
  ask_question_mode: z.enum(['pause', 'auto', 'hybrid']).optional(),
})

// POST / — create project (PM/TechLead only)
router.post('/', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const { name, slug, project_root, max_concurrent_agents, ask_question_mode } = parsed.data
    const user = req.user!

    // Check slug uniqueness
    const existing = db.select().from(projects).where(eq(projects.slug, slug)).get()
    if (existing) {
      res.status(409).json({ error: 'Project slug already exists' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const id = `proj_${nanoid(12)}`

    db.insert(projects).values({
      id,
      name,
      slug,
      project_root,
      max_concurrent_agents: max_concurrent_agents ?? 3,
      ask_question_mode: ask_question_mode ?? 'hybrid',
      created_at: now,
      updated_at: now,
    }).run()

    // Add creator as member
    db.insert(projectMembers).values({
      project_id: id,
      user_id: user.id,
      created_at: now,
    }).run()

    const project = db.select().from(projects).where(eq(projects.id, id)).get()

    emitToProject(id, 'project:created', project)
    res.status(201).json({ project })
  } catch (err) {
      res.status(500).json({ error: logError('projects', err) })
  }
})

// GET /:projectId — get project detail
router.get('/:projectId', (req, res) => {
  try {
    const user = req.user!
    const projectId = param(req, 'projectId')

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
      ?? db.select().from(projects).where(eq(projects.slug, projectId)).get()

    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Check membership
    const membership = db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, project.id), eq(projectMembers.user_id, user.id)))
      .get()

    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    res.json({ project })
  } catch (err) {
      res.status(500).json({ error: logError('projects', err) })
  }
})

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  max_concurrent_agents: z.number().int().min(1).max(20).optional(),
  ask_question_mode: z.enum(['pause', 'auto', 'hybrid']).optional(),
})

// PATCH /:projectId — update project settings
router.patch('/:projectId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = updateProjectSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    // Verify membership
    const user = req.user as { id: string }
    const membership = db.select().from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, user.id)))
      .get()
    if (!membership) {
      res.status(403).json({ error: 'Not a member of this project' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const updates: Record<string, unknown> = { updated_at: now }
    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.max_concurrent_agents !== undefined) updates.max_concurrent_agents = parsed.data.max_concurrent_agents
    if (parsed.data.ask_question_mode !== undefined) updates.ask_question_mode = parsed.data.ask_question_mode

    db.update(projects).set(updates).where(eq(projects.id, projectId)).run()

    const updated = db.select().from(projects).where(eq(projects.id, projectId)).get()
    emitToProject(projectId, 'project:updated', updated)
    res.json({ project: updated })
  } catch (err) {
      res.status(500).json({ error: logError('projects', err) })
  }
})

export default router
