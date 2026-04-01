import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { captures, activityLog } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import { logError } from '../utils/log-error.js'

/** Parse JSON text columns that Drizzle returns as strings */
function parseCapture(row: Record<string, unknown>) {
  return {
    ...row,
    attachments: typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments ?? [],
  }
}

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// Mounted at /api/projects/:projectId/captures
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

// GET / — list captures (filter by status, limit/offset)
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const status = req.query.status as string | undefined
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
    const offset = parseInt(req.query.offset as string) || 0

    const query = db
      .select()
      .from(captures)
      .where(
        status
          ? and(eq(captures.project_id, projectId), eq(captures.status, status as 'pending' | 'triaged' | 'deferred' | 'dismissed'))
          : eq(captures.project_id, projectId),
      )
      .orderBy(desc(captures.created_at))
      .limit(limit)
      .offset(offset)

    const rows = query.all()
    res.json({ captures: rows.map((r) => parseCapture(r as Record<string, unknown>)) })
  } catch (err) {
    res.status(500).json({ error: logError('captures', err) })
  }
})

const captureAttachmentSchema = z.object({
  filename: z.string().max(500),
  mimeType: z.string().max(200),
  url: z.string().max(5_000_000), // data URIs can be large (base64 images up to ~3.75MB)
})

const createCaptureSchema = z.object({
  text: z.string().min(1).max(5000),
  attachments: z.array(captureAttachmentSchema).max(10).optional(),
})

// POST / — create capture
router.post('/', (req, res) => {
  try {
    const parsed = createCaptureSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const user = req.user!
    const now = Math.floor(Date.now() / 1000)
    const id = `cap_${nanoid(12)}`

    db.insert(captures).values({
      id,
      project_id: projectId,
      user_id: user.id,
      text: parsed.data.text,
      status: 'pending',
      attachments: JSON.stringify(parsed.data.attachments ?? []),
      created_at: now,
    }).run()

    // Log activity
    db.insert(activityLog).values({
      project_id: projectId,
      user_id: user.id,
      action: 'capture_created',
      details: JSON.stringify({
        capture_id: id,
        title: parsed.data.text.slice(0, 80),
      }),
      created_at: now,
    }).run()

    const capture = db.select().from(captures).where(eq(captures.id, id)).get()
    const parsed_capture = capture ? parseCapture(capture as Record<string, unknown>) : capture
    emitToProject(projectId, 'capture:created', parsed_capture)
    res.status(201).json({ capture: parsed_capture })
  } catch (err) {
    res.status(500).json({ error: logError('captures', err) })
  }
})

const updateCaptureSchema = z.object({
  text: z.string().min(1).max(5000).optional(),
  status: z.enum(['pending', 'triaged', 'deferred', 'dismissed']).optional(),
  triage_result: z.string().optional(),
})

// PATCH /:captureId — update capture (triage)
router.patch('/:captureId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = updateCaptureSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const captureId = param(req, 'captureId')
    const user = req.user!

    const existing = db
      .select()
      .from(captures)
      .where(and(eq(captures.id, captureId), eq(captures.project_id, projectId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Capture not found' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const updates: Record<string, unknown> = {}
    if (parsed.data.text !== undefined) updates.text = parsed.data.text
    if (parsed.data.status !== undefined) updates.status = parsed.data.status
    if (parsed.data.triage_result !== undefined) updates.triage_result = parsed.data.triage_result

    // If triaging, record who and when
    if (parsed.data.status === 'triaged') {
      updates.triaged_at = now
      updates.triaged_by = user.id
    }

    db.update(captures).set(updates).where(eq(captures.id, captureId)).run()

    const updated = db.select().from(captures).where(eq(captures.id, captureId)).get()
    const parsed_capture = updated ? parseCapture(updated as Record<string, unknown>) : updated
    emitToProject(projectId, 'capture:updated', parsed_capture)
    res.json({ capture: parsed_capture })
  } catch (err) {
    res.status(500).json({ error: logError('captures', err) })
  }
})

// DELETE /:captureId — delete capture
router.delete('/:captureId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const captureId = param(req, 'captureId')

    const existing = db
      .select()
      .from(captures)
      .where(and(eq(captures.id, captureId), eq(captures.project_id, projectId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Capture not found' })
      return
    }

    db.delete(captures).where(eq(captures.id, captureId)).run()
    emitToProject(projectId, 'capture:deleted', { id: captureId })
    res.status(204).send()
  } catch (err) {
    res.status(500).json({ error: logError('captures', err) })
  }
})

export default router
