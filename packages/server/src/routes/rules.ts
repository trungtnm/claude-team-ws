import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and, desc, gte } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { knowledgeRules } from '../db/schema.js'
import { emitToProject } from '../services/socket-manager.js'

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

const createRuleSchema = z.object({
  rule_text: z.string().min(1).max(2000),
  category: z.enum(['coding', 'security', 'testing', 'architecture', 'general']).default('general'),
})

const updateRuleSchema = z.object({
  rule_text: z.string().min(1).max(2000).optional(),
  category: z.enum(['coding', 'security', 'testing', 'architecture', 'general']).optional(),
  maturity: z.enum(['candidate', 'established', 'proven', 'deprecated']).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

// ── GET /api/projects/:projectId/rules ───────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const category = req.query.category as string | undefined
    const maturity = req.query.maturity as string | undefined
    const minConfidence = parseFloat(req.query.min_confidence as string) || 0

    let results = db.select()
      .from(knowledgeRules)
      .where(eq(knowledgeRules.project_id, projectId))
      .orderBy(desc(knowledgeRules.confidence))
      .all()

    if (category) {
      results = results.filter((r) => r.category === category)
    }
    if (maturity) {
      results = results.filter((r) => r.maturity === maturity)
    }
    if (minConfidence > 0) {
      results = results.filter((r) => r.confidence >= minConfidence)
    }

    res.json({ rules: results })
  } catch (err) {
    res.status(500).json({ error: `Failed to list rules: ${(err as Error).message}` })
  }
})

// ── POST /api/projects/:projectId/rules ──────────────────────────────────────

router.post('/', requireRole('techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const parsed = createRuleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const id = nanoid(12)

    db.insert(knowledgeRules).values({
      id,
      project_id: projectId,
      rule_text: parsed.data.rule_text,
      category: parsed.data.category,
      source: 'manual',
      approved_by: req.user!.id,
    }).run()

    const rule = db.select().from(knowledgeRules).where(eq(knowledgeRules.id, id)).get()

    emitToProject(projectId, 'rule:created', rule)
    res.status(201).json({ rule })
  } catch (err) {
    res.status(500).json({ error: `Failed to create rule: ${(err as Error).message}` })
  }
})

// ── PATCH /api/projects/:projectId/rules/:ruleId ─────────────────────────────

router.patch('/:ruleId', requireRole('techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const { ruleId } = req.params as Record<string, string>
    const parsed = updateRuleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
      return
    }

    const existing = db.select().from(knowledgeRules).where(eq(knowledgeRules.id, ruleId)).get()
    if (!existing || existing.project_id !== projectId) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    db.update(knowledgeRules)
      .set({ ...parsed.data, updated_at: now })
      .where(eq(knowledgeRules.id, ruleId))
      .run()

    const updated = db.select().from(knowledgeRules).where(eq(knowledgeRules.id, ruleId)).get()
    res.json({ rule: updated })
  } catch (err) {
    res.status(500).json({ error: `Failed to update rule: ${(err as Error).message}` })
  }
})

// ── DELETE /api/projects/:projectId/rules/:ruleId ────────────────────────────

router.delete('/:ruleId', requireRole('techlead'), async (req, res) => {
  try {
    const projectId = (req.params as Record<string, string>).projectId
    const { ruleId } = req.params as Record<string, string>

    const existing = db.select().from(knowledgeRules).where(eq(knowledgeRules.id, ruleId)).get()
    if (!existing || existing.project_id !== projectId) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }

    db.delete(knowledgeRules).where(eq(knowledgeRules.id, ruleId)).run()
    res.json({ status: 'ok', message: 'Rule deleted' })
  } catch (err) {
    res.status(500).json({ error: `Failed to delete rule: ${(err as Error).message}` })
  }
})

export default router
