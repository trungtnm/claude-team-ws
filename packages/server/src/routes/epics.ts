import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and, desc, sql } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { nanoid } from 'nanoid'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { emitToProject } from '../services/socket-manager.js'
import * as schema from '../db/schema.js'
import { BeadsService } from '../services/beads-service.js'

// ── Validation schemas ─────────────────────────────────

const createEpicSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(4).default(2),
  labels: z.array(z.string()).optional(),
  repos: z.array(z.string()).optional(),
})

const updateEpicSchema = z.object({
  ui_status: z.enum(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
  git_branches: z.array(z.object({
    repo: z.string(),
    branch: z.string(),
  })).optional(),
  scope_analysis: z.unknown().optional(),
  split_proposal: z.unknown().optional(),
})

const listQuerySchema = z.object({
  ui_status: z.enum(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

// ── Router factory ─────────────────────────────────────

export function createEpicsRouter(deps: {
  db: BetterSQLite3Database<typeof schema>
  beadsService: BeadsService
}): RouterType {
  const { db, beadsService } = deps
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)

  // GET /api/projects/:projectId/epics
  router.get('/', async (req, res) => {
    try {
      const projectId = (req.params as Record<string, string>).projectId
      const parsed = listQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid query parameters', details: parsed.error.issues })
        return
      }

      const { ui_status, limit, offset } = parsed.data

      const conditions = [eq(schema.epics.project_id, projectId)]
      if (ui_status) {
        conditions.push(eq(schema.epics.ui_status, ui_status))
      }

      const rows = db
        .select()
        .from(schema.epics)
        .where(and(...conditions))
        .orderBy(desc(schema.epics.created_at))
        .limit(limit)
        .offset(offset)
        .all()

      // Enrich each epic with bead data from br
      const enriched = await Promise.all(
        rows.map(async (epic) => {
          try {
            const bead = await beadsService.show(epic.bead_epic_id)
            return { ...epic, bead }
          } catch {
            return { ...epic, bead: null }
          }
        }),
      )

      const countResult = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.epics)
        .where(and(...conditions))
        .all()

      res.json({
        epics: enriched,
        total: countResult[0].count,
        limit,
        offset,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list epics'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/projects/:projectId/epics/:epicId
  router.get('/:epicId', async (req, res) => {
    try {
      const { projectId, epicId } = req.params as Record<string, string>

      const [epic] = db
        .select()
        .from(schema.epics)
        .where(and(eq(schema.epics.id, epicId), eq(schema.epics.project_id, projectId)))
        .all()

      if (!epic) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      // Fetch bead details
      let bead = null
      try {
        bead = await beadsService.show(epic.bead_epic_id)
      } catch {
        // bead may have been deleted
      }

      // Fetch sessions linked to this epic
      const epicSessions = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.epic_id, epicId))
        .orderBy(desc(schema.sessions.created_at))
        .all()

      res.json({ epic: { ...epic, bead, sessions: epicSessions } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get epic'
      res.status(500).json({ error: message })
    }
  })

  // POST /api/projects/:projectId/epics
  router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const parsed = createEpicSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
        return
      }

      const projectId = (req.params as Record<string, string>).projectId as string
      const { title, description, priority, labels } = parsed.data

      // Create bead via br
      const beadId = await beadsService.create({
        title,
        type: 'epic',
        priority,
        labels,
        description,
      })
      await beadsService.sync()

      // Create epic record in app DB
      const epicId = nanoid()
      const now = Math.floor(Date.now() / 1000)

      db.insert(schema.epics).values({
        id: epicId,
        project_id: projectId,
        bead_epic_id: beadId,
        ui_status: 'ready',
        created_at: now,
        updated_at: now,
      }).run()

      // Log activity
      db.insert(schema.activityLog).values({
        project_id: projectId,
        user_id: req.user!.id,
        action: 'epic_created',
        details: JSON.stringify({ epic_id: epicId, bead_epic_id: beadId }),
      }).run()

      const [epic] = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .all()

      const bead = await beadsService.show(beadId)

      emitToProject(projectId, 'epic:created', { ...epic, bead })

      res.status(201).json({ epic: { ...epic, bead } })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create epic'
      res.status(500).json({ error: message })
    }
  })

  // PATCH /api/projects/:projectId/epics/:epicId
  router.patch('/:epicId', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const parsed = updateEpicSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
        return
      }

      const { projectId, epicId } = req.params as Record<string, string>

      const [existing] = db
        .select()
        .from(schema.epics)
        .where(and(eq(schema.epics.id, epicId), eq(schema.epics.project_id, projectId)))
        .all()

      if (!existing) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      const now = Math.floor(Date.now() / 1000)
      const updateData: Record<string, unknown> = { updated_at: now }

      if (parsed.data.ui_status) updateData.ui_status = parsed.data.ui_status
      if (parsed.data.git_branches) updateData.git_branches = JSON.stringify(parsed.data.git_branches)
      if (parsed.data.scope_analysis !== undefined) updateData.scope_analysis = JSON.stringify(parsed.data.scope_analysis)
      if (parsed.data.split_proposal !== undefined) updateData.split_proposal = JSON.stringify(parsed.data.split_proposal)

      db.update(schema.epics)
        .set(updateData)
        .where(eq(schema.epics.id, epicId))
        .run()

      const [updated] = db
        .select()
        .from(schema.epics)
        .where(eq(schema.epics.id, epicId))
        .all()

      emitToProject(projectId, 'epic:updated', updated)

      res.json({ epic: updated })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update epic'
      res.status(500).json({ error: message })
    }
  })

  // POST /api/projects/:projectId/epics/:epicId/analyze-scope
  router.post('/:epicId/analyze-scope', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const { projectId, epicId } = req.params as Record<string, string>

      const [epic] = db
        .select()
        .from(schema.epics)
        .where(and(eq(schema.epics.id, epicId), eq(schema.epics.project_id, projectId)))
        .all()

      if (!epic) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      // Fetch bead details for scope analysis context
      const bead = await beadsService.show(epic.bead_epic_id)

      // Scope analysis is a placeholder for now — the real implementation
      // will use Claude to analyze the epic and suggest splits.
      // For now, return the bead data so the UI can display it.
      const analysis = {
        bead_epic_id: epic.bead_epic_id,
        title: bead.title,
        priority: bead.priority,
        status: bead.status,
        labels: bead.labels,
        dependencies: bead.dependencies || [],
        dependents: bead.dependents || [],
      }

      // Store the analysis on the epic
      const now = Math.floor(Date.now() / 1000)
      db.update(schema.epics)
        .set({ scope_analysis: JSON.stringify(analysis), updated_at: now })
        .where(eq(schema.epics.id, epicId))
        .run()

      emitToProject(projectId, 'epic:updated', { id: epicId, scope_analysis: analysis })

      res.json({ analysis })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze scope'
      res.status(500).json({ error: message })
    }
  })

  return router
}
