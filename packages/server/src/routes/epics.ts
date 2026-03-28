import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { epics, sessions, activityLog } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import { logError } from '../utils/log-error.js'

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

/** Parse JSON fields from epic row */
function enrichEpic(epic: typeof epics.$inferSelect, extra?: Record<string, unknown>) {
  return {
    ...epic,
    git_branches: JSON.parse(epic.git_branches),
    labels: JSON.parse(epic.labels),
    scope_analysis: epic.scope_analysis ? JSON.parse(epic.scope_analysis) : null,
    split_proposal: epic.split_proposal ? JSON.parse(epic.split_proposal) : null,
    ...extra,
  }
}

// Mounted at /api/projects/:projectId/epics
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

// GET / — list epics
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const uiStatus = req.query.ui_status as string | undefined

    const rows = db
      .select()
      .from(epics)
      .where(
        uiStatus
          ? and(eq(epics.project_id, projectId), eq(epics.ui_status, uiStatus as typeof epics.ui_status.enumValues[number]))
          : eq(epics.project_id, projectId),
      )
      .orderBy(desc(epics.created_at))
      .all()

    // Fetch active sessions for all epics in one query
    const epicIds = rows.map((r) => r.id)
    const activeSessions = epicIds.length > 0
      ? db
          .select({
            id: sessions.id,
            epic_id: sessions.epic_id,
            status: sessions.status,
            model: sessions.model,
          })
          .from(sessions)
          .where(
            and(
              inArray(sessions.epic_id, epicIds),
              inArray(sessions.status, ['queued', 'running', 'waiting_input', 'idle']),
            ),
          )
          .orderBy(desc(sessions.created_at))
          .all()
      : []

    // Build a map: epicId → most recent active session
    const activeSessionByEpic = new Map<string, { id: string; status: string; model: string }>()
    for (const s of activeSessions) {
      if (s.epic_id && !activeSessionByEpic.has(s.epic_id)) {
        activeSessionByEpic.set(s.epic_id, { id: s.id, status: s.status, model: s.model })
      }
    }

    const enriched = rows.map((epic) => enrichEpic(epic, {
      activeSession: activeSessionByEpic.get(epic.id) ?? null,
    }))

    res.json({ epics: enriched })
  } catch (err) {
    res.status(500).json({ error: logError('epics', err) })
  }
})

const createEpicSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  type: z.enum(['feature', 'bug', 'task', 'epic', 'spike']).optional(),
  labels: z.array(z.string()).optional(),
  assignee: z.string().max(100).optional(),
  git_branches: z.array(z.string()).optional(),
  ui_status: z.enum(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
})

// POST / — create epic
router.post('/', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = createEpicSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const user = req.user!
    const { title, description, priority, type, labels, assignee, git_branches, ui_status } = parsed.data

    const now = Math.floor(Date.now() / 1000)
    const id = `epic_${nanoid(12)}`

    db.insert(epics).values({
      id,
      project_id: projectId,
      title,
      description: description ?? '',
      priority: priority ?? 2,
      type: type ?? 'task',
      labels: JSON.stringify(labels ?? []),
      assignee: assignee ?? null,
      git_branches: JSON.stringify(git_branches ?? []),
      ui_status: ui_status ?? 'ready',
      created_at: now,
      updated_at: now,
    }).run()

    // Log activity
    db.insert(activityLog).values({
      project_id: projectId,
      user_id: user.id,
      action: 'epic_created',
      details: JSON.stringify({ epic_id: id, title }),
      created_at: now,
    }).run()

    const epic = db.select().from(epics).where(eq(epics.id, id)).get()!
    const enriched = enrichEpic(epic, { activeSession: null })

    emitToProject(projectId, 'epic:created', enriched)
    res.status(201).json({ epic: enriched })
  } catch (err) {
    res.status(500).json({ error: logError('epics', err) })
  }
})

// GET /:epicId — epic detail with sessions
router.get('/:epicId', (req, res) => {
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

    // Find active session
    const activeSession = epicSessions.find((s) =>
      ['queued', 'running', 'waiting_input', 'idle'].includes(s.status),
    )

    const enriched = enrichEpic(epic, {
      sessions: epicSessions,
      activeSession: activeSession
        ? { id: activeSession.id, status: activeSession.status, model: activeSession.model }
        : null,
    })

    res.json({ epic: enriched })
  } catch (err) {
    res.status(500).json({ error: logError('epics', err) })
  }
})

const updateEpicSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().optional(),
  priority: z.number().int().min(0).max(4).optional(),
  type: z.enum(['feature', 'bug', 'task', 'epic', 'spike']).optional(),
  labels: z.array(z.string().max(50)).optional(),
  assignee: z.string().max(100).nullable().optional(),
  ui_status: z.enum(['blocked', 'ready', 'in_progress', 'in_review', 'done', 'cancelled']).optional(),
  git_branches: z.array(z.string()).optional(),
  scope_analysis: z.record(z.unknown()).nullable().optional(),
  split_proposal: z.record(z.unknown()).nullable().optional(),
})

// PATCH /:epicId — update epic
router.patch('/:epicId', requireRole('pm', 'techlead'), (req, res) => {
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

    const now = Math.floor(Date.now() / 1000)
    const updates: Record<string, unknown> = { updated_at: now }
    if (parsed.data.title !== undefined) updates.title = parsed.data.title
    if (parsed.data.description !== undefined) updates.description = parsed.data.description
    if (parsed.data.priority !== undefined) updates.priority = parsed.data.priority
    if (parsed.data.type !== undefined) updates.type = parsed.data.type
    if (parsed.data.labels !== undefined) updates.labels = JSON.stringify(parsed.data.labels)
    if (parsed.data.assignee !== undefined) updates.assignee = parsed.data.assignee
    if (parsed.data.ui_status !== undefined) updates.ui_status = parsed.data.ui_status
    if (parsed.data.git_branches !== undefined) updates.git_branches = JSON.stringify(parsed.data.git_branches)
    if (parsed.data.scope_analysis !== undefined) {
      updates.scope_analysis = parsed.data.scope_analysis ? JSON.stringify(parsed.data.scope_analysis) : null
    }
    if (parsed.data.split_proposal !== undefined) {
      updates.split_proposal = parsed.data.split_proposal ? JSON.stringify(parsed.data.split_proposal) : null
    }

    db.update(epics).set(updates).where(eq(epics.id, epicId)).run()

    // Re-fetch
    const updated = db.select().from(epics).where(eq(epics.id, epicId)).get()!
    const activeSession = db
      .select({ id: sessions.id, status: sessions.status, model: sessions.model })
      .from(sessions)
      .where(
        and(
          eq(sessions.epic_id, epicId),
          inArray(sessions.status, ['queued', 'running', 'waiting_input', 'idle']),
        ),
      )
      .get()

    const enriched = enrichEpic(updated, { activeSession: activeSession ?? null })

    emitToProject(projectId, 'epic:updated', enriched)
    res.json({ epic: enriched })
  } catch (err) {
    res.status(500).json({ error: logError('epics', err) })
  }
})

// POST /:epicId/analyze-scope — scope analysis
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

    const analysis = {
      epic_id: epicId,
      status: 'analyzed',
      estimated_complexity: 'medium',
      suggested_tracks: 1,
      suggested_beads: 3,
      analyzed_at: Math.floor(Date.now() / 1000),
    }

    const now = Math.floor(Date.now() / 1000)
    db.update(epics)
      .set({ scope_analysis: JSON.stringify(analysis), updated_at: now })
      .where(eq(epics.id, epicId))
      .run()

    emitToProject(projectId, 'epic:updated', { id: epicId, scope_analysis: analysis })
    res.json({ analysis })
  } catch (err) {
    res.status(500).json({ error: logError('epics', err) })
  }
})

const confirmSplitSchema = z.object({
  beads: z.array(z.object({
    title: z.string().min(1),
    priority: z.number().int().min(0).max(4),
    description: z.string().optional(),
  })),
})

// POST /:epicId/confirm-split — store split proposal (no more child bead creation)
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
        split_proposal: JSON.stringify({ beads: parsed.data.beads, confirmed_at: now }),
        updated_at: now,
      })
      .where(eq(epics.id, epicId))
      .run()

    const updated = db.select().from(epics).where(eq(epics.id, epicId)).get()!
    const enriched = enrichEpic(updated)

    emitToProject(projectId, 'epic:updated', enriched)
    res.json({ epic: enriched, beads: parsed.data.beads })
  } catch (err) {
    res.status(500).json({ error: logError('epics', err) })
  }
})

export default router
