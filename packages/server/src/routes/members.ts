import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/index.js'
import { projectMembers, users } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'

// Mounted at /api/projects/:projectId/members
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list project members (join users table)
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')

    const rows = db
      .select({
        user_id: projectMembers.user_id,
        role_override: projectMembers.role_override,
        created_at: projectMembers.created_at,
        name: users.name,
        email: users.email,
        role: users.role,
        avatar_url: users.avatar_url,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.user_id, users.id))
      .where(eq(projectMembers.project_id, projectId))
      .all()

    res.json({ members: rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list members'
    res.status(500).json({ error: message })
  }
})

const addMemberSchema = z.object({
  user_id: z.string().min(1),
  role_override: z.enum(['pm', 'dev', 'techlead', 'viewer']).optional(),
})

// POST / — add member (PM/TechLead)
router.post('/', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = addMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const { user_id, role_override } = parsed.data

    // Check user exists
    const user = db.select().from(users).where(eq(users.id, user_id)).get()
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    // Check not already a member
    const existing = db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, user_id)))
      .get()

    if (existing) {
      res.status(409).json({ error: 'User is already a member of this project' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    db.insert(projectMembers).values({
      project_id: projectId,
      user_id,
      role_override: role_override ?? null,
      created_at: now,
    }).run()

    const member = {
      user_id,
      role_override: role_override ?? null,
      created_at: now,
      name: user.name,
      email: user.email,
      role: user.role,
      avatar_url: user.avatar_url,
    }

    emitToProject(projectId, 'member:added', member)
    res.status(201).json({ member })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to add member'
    res.status(500).json({ error: message })
  }
})

const updateMemberSchema = z.object({
  role_override: z.enum(['pm', 'dev', 'techlead', 'viewer']).nullable(),
})

// PATCH /:userId — update role override
router.patch('/:userId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = updateMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const userId = param(req, 'userId')

    const existing = db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Member not found' })
      return
    }

    db.update(projectMembers)
      .set({ role_override: parsed.data.role_override })
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .run()

    emitToProject(projectId, 'member:updated', { user_id: userId, role_override: parsed.data.role_override })
    res.json({ member: { ...existing, role_override: parsed.data.role_override } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update member'
    res.status(500).json({ error: message })
  }
})

// DELETE /:userId — remove member
router.delete('/:userId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const userId = param(req, 'userId')

    const existing = db
      .select()
      .from(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Member not found' })
      return
    }

    db.delete(projectMembers)
      .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, userId)))
      .run()

    emitToProject(projectId, 'member:removed', { user_id: userId })
    res.status(204).send()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove member'
    res.status(500).json({ error: message })
  }
})

export default router
