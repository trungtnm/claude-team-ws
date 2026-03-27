import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { webhookConfigs } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import { dispatch } from '../services/webhook-dispatcher.js'
import { logError } from '../utils/log-error.js'

// Mounted at /api/projects/:projectId/webhooks
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

/** Enrich a raw webhook row — parse events JSON and convert enabled to boolean */
function enrichWebhook(row: typeof webhookConfigs.$inferSelect) {
  return {
    ...row,
    events: JSON.parse(row.events) as string[],
    enabled: Boolean(row.enabled),
  }
}

// ─── Shared validation ───────────────────────────────────────────────────────

const allowedWebhookHosts = [
  'hooks.slack.com',
  'discord.com',
  'discordapp.com',
  'api.telegram.org',
]

const webhookUrlSchema = z.string().url().refine((url) => {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' &&
      allowedWebhookHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}, { message: 'URL must be an HTTPS endpoint on Slack, Discord, or Telegram' })

const webhookEventEnum = z.enum([
  'session_complete', 'pr_ready', 'pr_merged', 'question_waiting', 'session_failed',
])

const webhookTypeEnum = z.enum(['slack', 'discord', 'telegram'])

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET / — list webhooks
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const rows = db.select().from(webhookConfigs).where(eq(webhookConfigs.project_id, projectId)).all()
    res.json({ webhooks: rows.map(enrichWebhook) })
  } catch (err) {
      res.status(500).json({ error: logError('webhooks', err) })
  }
})

const createWebhookSchema = z.object({
  type: webhookTypeEnum,
  url: webhookUrlSchema,
  events: z.array(webhookEventEnum).min(1).optional(),
  enabled: z.boolean().optional(),
})

// POST / — create webhook (PM/TechLead)
router.post('/', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = createWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const now = Math.floor(Date.now() / 1000)
    const id = `wh_${nanoid(12)}`

    db.insert(webhookConfigs).values({
      id,
      project_id: projectId,
      type: parsed.data.type,
      url: parsed.data.url,
      events: JSON.stringify(parsed.data.events ?? ['session_complete', 'pr_ready', 'pr_merged']),
      enabled: parsed.data.enabled !== false ? 1 : 0,
      created_at: now,
    }).run()

    const webhook = db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id)).get()!
    const enriched = enrichWebhook(webhook)

    emitToProject(projectId, 'webhook:created', enriched)
    res.status(201).json({ webhook: enriched })
  } catch (err) {
      res.status(500).json({ error: logError('webhooks', err) })
  }
})

const updateWebhookSchema = z.object({
  url: webhookUrlSchema.optional(),
  events: z.array(webhookEventEnum).min(1).optional(),
  enabled: z.boolean().optional(),
})

// PATCH /:webhookId — update webhook (PM/TechLead)
router.patch('/:webhookId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const parsed = updateWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const webhookId = param(req, 'webhookId')

    const existing = db
      .select()
      .from(webhookConfigs)
      .where(and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.project_id, projectId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.url !== undefined) updates.url = parsed.data.url
    if (parsed.data.events !== undefined) updates.events = JSON.stringify(parsed.data.events)
    if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled ? 1 : 0

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }

    db.update(webhookConfigs)
      .set(updates)
      .where(and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.project_id, projectId)))
      .run()

    const updated = db.select().from(webhookConfigs).where(eq(webhookConfigs.id, webhookId)).get()!
    const enriched = enrichWebhook(updated)

    emitToProject(projectId, 'webhook:updated', enriched)
    res.json({ webhook: enriched })
  } catch (err) {
      res.status(500).json({ error: logError('webhooks', err) })
  }
})

// POST /:webhookId/test — send test notification
router.post('/:webhookId/test', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const webhookId = param(req, 'webhookId')

    const webhook = db
      .select()
      .from(webhookConfigs)
      .where(and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.project_id, projectId)))
      .get()

    if (!webhook) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    const result = await dispatch(
      webhook.type as 'slack' | 'discord' | 'telegram',
      webhook.url,
      {
        event: 'test',
        projectName: 'Claude Team Workspace',
      },
    )

    if (result.success) {
      res.json({ success: true, statusCode: result.statusCode })
    } else {
      res.status(502).json({
        success: false,
        statusCode: result.statusCode,
        error: result.error,
      })
    }
  } catch (err) {
    res.status(500).json({ error: logError('webhooks', err) })
  }
})

// DELETE /:webhookId — delete webhook (PM/TechLead)
router.delete('/:webhookId', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const webhookId = param(req, 'webhookId')

    const existing = db
      .select()
      .from(webhookConfigs)
      .where(and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.project_id, projectId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    db.delete(webhookConfigs)
      .where(and(eq(webhookConfigs.id, webhookId), eq(webhookConfigs.project_id, projectId)))
      .run()

    emitToProject(projectId, 'webhook:deleted', { id: webhookId })
    res.status(204).send()
  } catch (err) {
      res.status(500).json({ error: logError('webhooks', err) })
  }
})

export default router
