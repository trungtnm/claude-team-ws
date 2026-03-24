import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { webhookConfigs } from '../db/schema.js'

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

const createWebhookSchema = z.object({
  type: z.enum(['slack', 'discord']),
  url: z.string().url().refine(
    (url) => {
      try {
        const parsed = new URL(url)
        const h = parsed.hostname.toLowerCase()
        // Block internal/private addresses
        if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false
        if (h.startsWith('10.') || h.startsWith('192.168.') || h.startsWith('169.254.')) return false
        if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return false
        if (h === 'metadata.google.internal') return false
        return true
      } catch { return false }
    },
    { message: 'Webhook URL must not point to internal/private addresses' }
  ),
  events: z.array(z.string()).default(['session_complete', 'pr_ready', 'pr_merged']),
})

const updateWebhookSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  enabled: z.boolean().optional(),
})

// GET /api/projects/:projectId/webhooks
router.get('/', async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const configs = db.select().from(webhookConfigs).where(eq(webhookConfigs.project_id, projectId)).all()
    res.json({
      webhooks: configs.map((c) => ({ ...c, events: JSON.parse(c.events) })),
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to list webhooks: ${(err as Error).message}` })
  }
})

// POST /api/projects/:projectId/webhooks
router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const parsed = createWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const id = nanoid(12)
    db.insert(webhookConfigs).values({
      id,
      project_id: projectId,
      type: parsed.data.type,
      url: parsed.data.url,
      events: JSON.stringify(parsed.data.events),
    }).run()

    const webhook = db.select().from(webhookConfigs).where(eq(webhookConfigs.id, id)).get()
    res.status(201).json({ webhook: { ...webhook, events: parsed.data.events } })
  } catch (err) {
    res.status(500).json({ error: `Failed to create webhook: ${(err as Error).message}` })
  }
})

// PATCH /api/projects/:projectId/webhooks/:webhookId
router.patch('/:webhookId', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const { webhookId } = req.params as Record<string, string>
    const parsed = updateWebhookSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const existing = db.select().from(webhookConfigs).where(eq(webhookConfigs.id, webhookId)).get()
    if (!existing || existing.project_id !== projectId) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }

    const updates: Record<string, unknown> = {}
    if (parsed.data.url) updates.url = parsed.data.url
    if (parsed.data.events) updates.events = JSON.stringify(parsed.data.events)
    if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled

    db.update(webhookConfigs).set(updates).where(eq(webhookConfigs.id, webhookId)).run()
    const updated = db.select().from(webhookConfigs).where(eq(webhookConfigs.id, webhookId)).get()
    res.json({ webhook: { ...updated, events: JSON.parse(updated!.events) } })
  } catch (err) {
    res.status(500).json({ error: `Failed to update webhook: ${(err as Error).message}` })
  }
})

// DELETE /api/projects/:projectId/webhooks/:webhookId
router.delete('/:webhookId', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const { webhookId } = req.params as Record<string, string>
    const existing = db.select().from(webhookConfigs).where(eq(webhookConfigs.id, webhookId)).get()
    if (!existing || existing.project_id !== projectId) {
      res.status(404).json({ error: 'Webhook not found' })
      return
    }
    db.delete(webhookConfigs).where(eq(webhookConfigs.id, webhookId)).run()
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(500).json({ error: `Failed to delete webhook: ${(err as Error).message}` })
  }
})

export default router
