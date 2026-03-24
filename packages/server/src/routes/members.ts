import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { getProjectId } from '../middleware/project-access.js'
import { db } from '../db/index.js'
import { projectMembers, users } from '../db/schema.js'
import { emitToProject } from '../services/socket-manager.js'

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

// ── GET /api/projects/:projectId/members ─────────────────

router.get('/', async (req, res) => {
  try {
    const projectId = getProjectId(req, res)

    const rows = db
      .select({
        user_id: projectMembers.user_id,
        role_override: projectMembers.role_override,
        created_at: projectMembers.created_at,
        name: users.name,
        email: users.email,
        role: users.role,
      })
      .from(projectMembers)
      .innerJoin(users, eq(projectMembers.user_id, users.id))
      .where(eq(projectMembers.project_id, projectId))
      .all()

    res.json({ members: rows })
  } catch (err) {
    res.status(500).json({ error: `Failed to list members: ${(err as Error).message}` })
  }
})

// ── POST /api/projects/:projectId/members ────────────────

const addMemberSchema = z.object({
  user_id: z.string().min(1),
  role_override: z.enum(['pm', 'dev', 'techlead', 'viewer']).optional(),
})

router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = getProjectId(req, res)
    const parsed = addMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
      return
    }

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

    emitToProject(projectId, 'member:added', {
      member: { user_id, name: user.name, email: user.email, role_override },
      added_by: req.user!.id,
    })

    res.status(201).json({ member: { user_id, role_override, created_at: now } })
  } catch (err) {
    res.status(500).json({ error: `Failed to add member: ${(err as Error).message}` })
  }
})

// ── PATCH /api/projects/:projectId/members/:userId ───────

const updateMemberSchema = z.object({
  role_override: z.enum(['pm', 'dev', 'techlead', 'viewer']),
})

router.patch('/:userId', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = getProjectId(req, res)
    const { userId } = req.params as Record<string, string>
    const parsed = updateMemberSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
      return
    }

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

    res.json({ member: { user_id: userId, role_override: parsed.data.role_override } })
  } catch (err) {
    res.status(500).json({ error: `Failed to update member: ${(err as Error).message}` })
  }
})

// ── DELETE /api/projects/:projectId/members/:userId ──────

router.delete('/:userId', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = getProjectId(req, res)
    const { userId } = req.params as Record<string, string>

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

    emitToProject(projectId, 'member:removed', {
      user_id: userId,
      removed_by: req.user!.id,
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: `Failed to remove member: ${(err as Error).message}` })
  }
})

export default router
