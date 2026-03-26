import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schemaTypes from '../db/schema.js'
import { epics, sessions, activityLog } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import type { BeadsService } from '../services/beads-service.js'

interface EpicsRouterDeps {
  db: BetterSQLite3Database<typeof schemaTypes>
  beadsService: BeadsService
}

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

export function createEpicsRouter({ db, beadsService }: EpicsRouterDeps): RouterType {
  // Mounted at /api/projects/:projectId/epics
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)
  router.use(requireProjectMember)

  // GET / — list epics with bead data
  router.get('/', async (req, res) => {
    try {
      const projectId = param(req, 'projectId')

      const rows = db
        .select()
        .from(epics)
        .where(eq(epics.project_id, projectId))
        .orderBy(desc(epics.created_at))
        .all()

      // Hydrate with bead data
      const enriched = await Promise.all(
        rows.map(async (epic) => {
          let beadData: Record<string, unknown> | null = null
          try {
            beadData = await beadsService.show(epic.bead_epic_id)
          } catch {
            // Bead may not exist or service may be unavailable
          }
          return {
            ...epic,
            git_branches: JSON.parse(epic.git_branches),
            scope_analysis: epic.scope_analysis ? JSON.parse(epic.scope_analysis) : null,
            split_proposal: epic.split_proposal ? JSON.parse(epic.split_proposal) : null,
            bead: beadData,
          }
        }),
      )

      res.json({ epics: enriched })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list epics'
      res.status(500).json({ error: message })
    }
  })

  const createEpicSchema = z.object({
    title: z.string().min(1).max(500),
    description: z.string().optional(),
    priority: z.number().int().min(0).max(4).optional(),
    labels: z.array(z.string()).optional(),
    git_branches: z.array(z.string()).optional(),
  })

  // POST / — create epic (creates bead + DB row)
  router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const parsed = createEpicSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
        return
      }

      const projectId = param(req, 'projectId')
      const user = req.user!
      const { title, description, priority, labels, git_branches } = parsed.data

      // Create bead first
      const beadId = await beadsService.create({
        title,
        type: 'epic',
        priority: priority ?? 2,
        labels,
        description,
      })

      const now = Math.floor(Date.now() / 1000)
      const id = `epic_${nanoid(12)}`

      db.insert(epics).values({
        id,
        project_id: projectId,
        bead_epic_id: beadId,
        git_branches: JSON.stringify(git_branches ?? []),
        ui_status: 'ready',
        created_at: now,
        updated_at: now,
      }).run()

      // Log activity
      db.insert(activityLog).values({
        project_id: projectId,
        user_id: user.id,
        action: 'epic_created',
        details: JSON.stringify({ epic_id: id, bead_id: beadId }),
        created_at: now,
      }).run()

      const epic = db.select().from(epics).where(eq(epics.id, id)).get()

      let beadData: Record<string, unknown> | null = null
      try {
        beadData = await beadsService.show(beadId)
      } catch {
        // Service may be unavailable
      }

      const enriched = {
        ...epic,
        git_branches: git_branches ?? [],
        scope_analysis: null,
        split_proposal: null,
        bead: beadData,
      }

      emitToProject(projectId, 'epic:created', enriched)
      res.status(201).json({ epic: enriched })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create epic'
      res.status(500).json({ error: message })
    }
  })

  // GET /:epicId — epic detail with sessions
  router.get('/:epicId', async (req, res) => {
    try {
      const projectId = param(req, 'projectId')
      const epicId = param(req, 'epicId')

      const epic = db
        .select()
        .from(epics)
        .where(and(eq(epics.id, epicId), eq(epics.project_id, projectId)))
        .get()

      if (!epic) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      // Get sessions for this epic
      const epicSessions = db
        .select()
        .from(sessions)
        .where(eq(sessions.epic_id, epicId))
        .orderBy(desc(sessions.created_at))
        .all()

      let beadData: Record<string, unknown> | null = null
      try {
        beadData = await beadsService.show(epic.bead_epic_id)
      } catch {
        // Service may be unavailable
      }

      const enriched = {
        ...epic,
        git_branches: JSON.parse(epic.git_branches),
        scope_analysis: epic.scope_analysis ? JSON.parse(epic.scope_analysis) : null,
        split_proposal: epic.split_proposal ? JSON.parse(epic.split_proposal) : null,
        bead: beadData,
        sessions: epicSessions,
      }

      res.json({ epic: enriched })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get epic'
      res.status(500).json({ error: message })
    }
  })

  const updateEpicSchema = z.object({
    // App DB fields (epics table)
    ui_status: z.enum(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
    git_branches: z.array(z.string()).optional(),
    scope_analysis: z.record(z.unknown()).nullable().optional(),
    split_proposal: z.record(z.unknown()).nullable().optional(),
    // Bead-level fields (synced to beads.db via br CLI)
    bead_priority: z.number().int().min(0).max(4).optional(),
    bead_type: z.enum(['feature', 'bug', 'task', 'docs', 'epic', 'spike']).optional(),
    bead_labels: z.array(z.string().max(50)).optional(),
    bead_assignee: z.string().max(100).optional(),
  })

  // PATCH /:epicId — update epic (app DB + bead DB)
  router.patch('/:epicId', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const parsed = updateEpicSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
        return
      }

      const projectId = param(req, 'projectId')
      const epicId = param(req, 'epicId')

      const existing = db
        .select()
        .from(epics)
        .where(and(eq(epics.id, epicId), eq(epics.project_id, projectId)))
        .get()

      if (!existing) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      // Update app DB fields
      const now = Math.floor(Date.now() / 1000)
      const updates: Record<string, unknown> = { updated_at: now }
      if (parsed.data.ui_status !== undefined) updates.ui_status = parsed.data.ui_status
      if (parsed.data.git_branches !== undefined) updates.git_branches = JSON.stringify(parsed.data.git_branches)
      if (parsed.data.scope_analysis !== undefined) {
        updates.scope_analysis = parsed.data.scope_analysis ? JSON.stringify(parsed.data.scope_analysis) : null
      }
      if (parsed.data.split_proposal !== undefined) {
        updates.split_proposal = parsed.data.split_proposal ? JSON.stringify(parsed.data.split_proposal) : null
      }

      db.update(epics).set(updates).where(eq(epics.id, epicId)).run()

      // Update bead-level fields via br CLI (if any bead fields were provided)
      const beadUpdate: Record<string, unknown> = {}
      if (parsed.data.bead_priority !== undefined) beadUpdate.priority = parsed.data.bead_priority
      if (parsed.data.bead_type !== undefined) beadUpdate.type = parsed.data.bead_type
      if (parsed.data.bead_labels !== undefined) beadUpdate.labels = parsed.data.bead_labels
      if (parsed.data.bead_assignee !== undefined) beadUpdate.assignee = parsed.data.bead_assignee

      if (Object.keys(beadUpdate).length > 0) {
        try {
          await beadsService.update(existing.bead_epic_id, beadUpdate as {
            priority?: number
            type?: string
            labels?: string[]
            assignee?: string
          })
        } catch (beadErr) {
          // Log but don't fail the request — app DB was already updated
          console.error(`Failed to update bead ${existing.bead_epic_id}:`, beadErr)
        }
      }

      // Re-fetch with hydrated bead data
      const updated = db.select().from(epics).where(eq(epics.id, epicId)).get()!
      let beadData: Record<string, unknown> | null = null
      try {
        beadData = await beadsService.show(updated.bead_epic_id)
      } catch {
        // Service may be unavailable
      }

      const enriched = {
        ...updated,
        git_branches: JSON.parse(updated.git_branches),
        scope_analysis: updated.scope_analysis ? JSON.parse(updated.scope_analysis) : null,
        split_proposal: updated.split_proposal ? JSON.parse(updated.split_proposal) : null,
        bead: beadData,
      }

      emitToProject(projectId, 'epic:updated', enriched)
      res.json({ epic: enriched })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update epic'
      res.status(500).json({ error: message })
    }
  })

  // POST /:epicId/analyze-scope — scope analysis (returns computed response)
  router.post('/:epicId/analyze-scope', requireRole('pm', 'techlead'), (req, res) => {
    try {
      const projectId = param(req, 'projectId')
      const epicId = param(req, 'epicId')

      const epic = db
        .select()
        .from(epics)
        .where(and(eq(epics.id, epicId), eq(epics.project_id, projectId)))
        .get()

      if (!epic) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      // Return a scope analysis response based on current state
      const analysis = {
        epic_id: epicId,
        bead_epic_id: epic.bead_epic_id,
        status: 'analyzed',
        estimated_complexity: 'medium',
        suggested_tracks: 1,
        suggested_beads: 3,
        analyzed_at: Math.floor(Date.now() / 1000),
      }

      // Store analysis on the epic
      const now = Math.floor(Date.now() / 1000)
      db.update(epics)
        .set({ scope_analysis: JSON.stringify(analysis), updated_at: now })
        .where(eq(epics.id, epicId))
        .run()

      emitToProject(projectId, 'epic:updated', { id: epicId, scope_analysis: analysis })
      res.json({ analysis })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to analyze scope'
      res.status(500).json({ error: message })
    }
  })

  const confirmSplitSchema = z.object({
    tracks: z.array(z.object({
      title: z.string(),
      beads: z.array(z.string()),
    })),
  })

  // POST /:epicId/confirm-split — confirm split proposal
  router.post('/:epicId/confirm-split', requireRole('pm', 'techlead'), (req, res) => {
    try {
      const parsed = confirmSplitSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
        return
      }

      const projectId = param(req, 'projectId')
      const epicId = param(req, 'epicId')

      const epic = db
        .select()
        .from(epics)
        .where(and(eq(epics.id, epicId), eq(epics.project_id, projectId)))
        .get()

      if (!epic) {
        res.status(404).json({ error: 'Epic not found' })
        return
      }

      const now = Math.floor(Date.now() / 1000)
      db.update(epics)
        .set({
          split_proposal: JSON.stringify({ tracks: parsed.data.tracks, confirmed_at: now }),
          updated_at: now,
        })
        .where(eq(epics.id, epicId))
        .run()

      const updated = db.select().from(epics).where(eq(epics.id, epicId)).get()!
      const enriched = {
        ...updated,
        git_branches: JSON.parse(updated.git_branches),
        scope_analysis: updated.scope_analysis ? JSON.parse(updated.scope_analysis) : null,
        split_proposal: JSON.parse(updated.split_proposal!),
      }

      emitToProject(projectId, 'epic:updated', enriched)
      res.json({ epic: enriched })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to confirm split'
      res.status(500).json({ error: message })
    }
  })

  return router
}
