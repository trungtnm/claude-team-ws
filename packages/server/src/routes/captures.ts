import { Router } from 'express'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { nanoid } from 'nanoid'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { emitToProject } from '../services/socket-manager.js'
import * as schema from '../db/schema.js'
import { BeadsService } from '../services/beads-service.js'

const createCaptureSchema = z.object({
  text: z.string().min(1).max(2000),
})

const triageCaptureSchema = z.object({
  status: z.enum(['triaged', 'deferred', 'dismissed']),
  triage_result: z.object({
    type: z.enum(['epic', 'quick-fix']),
    title: z.string().optional(),
    description: z.string().optional(),
    priority: z.number().min(0).max(4).optional(),
    commit: z.string().optional(),
  }).optional(),
})

export function createCapturesRouter(deps: {
  db: BetterSQLite3Database<typeof schema>
  beadsService: BeadsService
}): Router {
  const { db, beadsService } = deps
  const router = Router({ mergeParams: true })

  router.use(authenticate)

  // GET /api/projects/:projectId/captures
  router.get('/', async (req, res) => {
    try {
      const projectId = (req.params as Record<string, string>).projectId
      const status = req.query.status as string | undefined
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
      const offset = parseInt(req.query.offset as string) || 0

      let query = db
        .select()
        .from(schema.captures)
        .where(
          status
            ? and(
                eq(schema.captures.project_id, projectId),
                eq(schema.captures.status, status as 'pending' | 'triaged' | 'deferred' | 'dismissed'),
              )
            : eq(schema.captures.project_id, projectId),
        )
        .orderBy(desc(schema.captures.created_at))
        .limit(limit)
        .offset(offset)

      const rows = query.all()
      res.json({ captures: rows })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list captures'
      res.status(500).json({ error: message })
    }
  })

  // POST /api/projects/:projectId/captures
  router.post('/', requireRole('pm', 'dev', 'techlead'), async (req, res) => {
    try {
      const parsed = createCaptureSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
        return
      }

      const projectId = (req.params as Record<string, string>).projectId
      const capture = {
        id: nanoid(),
        project_id: projectId,
        user_id: req.user!.id,
        text: parsed.data.text,
        status: 'pending' as const,
      }

      db.insert(schema.captures).values(capture).run()

      emitToProject(projectId, 'capture:created', capture)

      db.insert(schema.activityLog).values({
        project_id: projectId,
        user_id: req.user!.id,
        action: 'capture_created',
        details: JSON.stringify({ capture_id: capture.id }),
      }).run()

      res.status(201).json({ capture })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create capture'
      res.status(500).json({ error: message })
    }
  })

  // PATCH /api/projects/:projectId/captures/:captureId
  router.patch('/:captureId', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const parsed = triageCaptureSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
        return
      }

      const projectId = (req.params as Record<string, string>).projectId
      const captureId = (req.params as Record<string, string>).captureId
      const { status, triage_result } = parsed.data
      const now = Math.floor(Date.now() / 1000)

      // If triaging to epic, auto-create via br
      let beadEpicId: string | undefined
      if (status === 'triaged' && triage_result?.type === 'epic' && triage_result.title) {
        beadEpicId = await beadsService.create({
          title: triage_result.title,
          type: 'epic',
          priority: triage_result.priority ?? 2,
          description: triage_result.description,
        })

        // Create epic record in app DB
        db.insert(schema.epics).values({
          id: nanoid(),
          project_id: projectId,
          bead_epic_id: beadEpicId,
        }).run()

        await beadsService.sync()

        emitToProject(projectId, 'epic:created', { bead_epic_id: beadEpicId })
      }

      const triageResultJson = triage_result
        ? JSON.stringify({ ...triage_result, epic_bead_id: beadEpicId })
        : null

      db.update(schema.captures)
        .set({
          status,
          triage_result: triageResultJson,
          triaged_at: now,
          triaged_by: req.user!.id,
        })
        .where(
          and(
            eq(schema.captures.id, captureId),
            eq(schema.captures.project_id, projectId),
          ),
        )
        .run()

      emitToProject(projectId, 'capture:updated', { id: captureId, status })

      res.json({ ok: true, bead_epic_id: beadEpicId })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to triage capture'
      res.status(500).json({ error: message })
    }
  })

  // DELETE /api/projects/:projectId/captures/:captureId
  router.delete('/:captureId', requireRole('pm', 'techlead'), async (req, res) => {
    try {
      const projectId = (req.params as Record<string, string>).projectId
      const captureId = (req.params as Record<string, string>).captureId

      db.delete(schema.captures)
        .where(
          and(
            eq(schema.captures.id, captureId),
            eq(schema.captures.project_id, projectId),
          ),
        )
        .run()

      emitToProject(projectId, 'capture:deleted', { id: captureId })

      res.json({ ok: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete capture'
      res.status(500).json({ error: message })
    }
  })

  return router
}
