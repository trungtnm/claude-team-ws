import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { knowledgeRules } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { logError } from '../utils/log-error.js'

// Mounted at /api/projects/:projectId/rules
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list rules (filter by category, maturity)
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const category = req.query.category as string | undefined
    const maturity = req.query.maturity as string | undefined

    let rows = db
      .select()
      .from(knowledgeRules)
      .where(eq(knowledgeRules.project_id, projectId))
      .all()

    if (category) {
      rows = rows.filter(r => r.category === category)
    }
    if (maturity) {
      rows = rows.filter(r => r.maturity === maturity)
    }

    res.json({ rules: rows })
  } catch (err) {
      res.status(500).json({ error: logError('rules', err) })
  }
})

const createRuleSchema = z.object({
  rule_text: z.string().min(1).max(5000),
  category: z.enum(['coding', 'security', 'testing', 'architecture', 'general']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  maturity: z.enum(['candidate', 'established', 'proven', 'deprecated']).optional(),
  source: z.enum(['manual', 'auto']).optional(),
  source_session_id: z.string().optional(),
})

// POST / — create rule (TechLead only)
router.post('/', requireRole('techlead'), (req, res) => {
  try {
    const parsed = createRuleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const user = req.user!
    const now = Math.floor(Date.now() / 1000)
    const id = `rule_${nanoid(12)}`

    db.insert(knowledgeRules).values({
      id,
      project_id: projectId,
      rule_text: parsed.data.rule_text,
      category: parsed.data.category ?? 'general',
      confidence: parsed.data.confidence ?? 0.5,
      maturity: parsed.data.maturity ?? 'candidate',
      source: parsed.data.source ?? 'manual',
      source_session_id: parsed.data.source_session_id ?? null,
      approved_by: user.id,
      created_at: now,
      updated_at: now,
    }).run()

    const rule = db.select().from(knowledgeRules).where(eq(knowledgeRules.id, id)).get()
    emitToProject(projectId, 'rule:created', rule)
    res.status(201).json({ rule })
  } catch (err) {
      res.status(500).json({ error: logError('rules', err) })
  }
})

const updateRuleSchema = z.object({
  rule_text: z.string().min(1).max(5000).optional(),
  category: z.enum(['coding', 'security', 'testing', 'architecture', 'general']).optional(),
  confidence: z.number().min(0).max(1).optional(),
  maturity: z.enum(['candidate', 'established', 'proven', 'deprecated']).optional(),
  helpful_count: z.number().int().min(0).optional(),
  harmful_count: z.number().int().min(0).optional(),
})

// PATCH /:ruleId — update rule
router.patch('/:ruleId', requireRole('techlead'), (req, res) => {
  try {
    const parsed = updateRuleSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const ruleId = param(req, 'ruleId')

    const existing = db
      .select()
      .from(knowledgeRules)
      .where(and(eq(knowledgeRules.id, ruleId), eq(knowledgeRules.project_id, projectId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const updates: Record<string, unknown> = { updated_at: now }
    if (parsed.data.rule_text !== undefined) updates.rule_text = parsed.data.rule_text
    if (parsed.data.category !== undefined) updates.category = parsed.data.category
    if (parsed.data.confidence !== undefined) updates.confidence = parsed.data.confidence
    if (parsed.data.maturity !== undefined) updates.maturity = parsed.data.maturity
    if (parsed.data.helpful_count !== undefined) updates.helpful_count = parsed.data.helpful_count
    if (parsed.data.harmful_count !== undefined) updates.harmful_count = parsed.data.harmful_count

    db.update(knowledgeRules).set(updates).where(eq(knowledgeRules.id, ruleId)).run()

    const updated = db.select().from(knowledgeRules).where(eq(knowledgeRules.id, ruleId)).get()
    emitToProject(projectId, 'rule:updated', updated)
    res.json({ rule: updated })
  } catch (err) {
      res.status(500).json({ error: logError('rules', err) })
  }
})

// DELETE /:ruleId — delete rule
router.delete('/:ruleId', requireRole('techlead'), (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const ruleId = param(req, 'ruleId')

    const existing = db
      .select()
      .from(knowledgeRules)
      .where(and(eq(knowledgeRules.id, ruleId), eq(knowledgeRules.project_id, projectId)))
      .get()

    if (!existing) {
      res.status(404).json({ error: 'Rule not found' })
      return
    }

    db.delete(knowledgeRules).where(eq(knowledgeRules.id, ruleId)).run()
    emitToProject(projectId, 'rule:deleted', { id: ruleId })
    res.status(204).send()
  } catch (err) {
      res.status(500).json({ error: logError('rules', err) })
  }
})

// POST /improve — use AI to improve rule text
const improveSchema = z.object({
  text: z.string().min(1).max(5000),
})

router.post('/improve', async (req, res) => {
  try {
    const parsed = improveSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const { text } = parsed.data
    const abortController = new AbortController()
    const timeout = setTimeout(() => abortController.abort(), 15_000)

    try {
      const prompt = `You are a knowledge rule editor for AI coding agents. Improve the following rule to be more specific, actionable, and written in clear imperative tone.

Rule to improve:
"${text}"

Return ONLY a JSON object with exactly these fields:
- "suggestion": the improved rule text (string)
- "explanation": brief explanation of what you changed and why (string)
- "category": the best category for this rule, one of: coding, security, testing, architecture, general (string)

Return ONLY the JSON object, no markdown fences, no extra text.`

      let responseText = ''

      const agentQuery = query({
        prompt,
        options: {
          model: 'claude-sonnet-4-6',
          maxTurns: 1,
          systemPrompt: 'You are a knowledge rule improvement assistant. Output only valid JSON.',
          abortController,
        } as Parameters<typeof query>[0]['options'],
      })

      for await (const message of agentQuery) {
        if (abortController.signal.aborted) break
        const msg = message as Record<string, unknown>
        if (msg.type === 'assistant') {
          const content = (msg.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined
          if (content) {
            for (const block of content) {
              if (block.type === 'text') {
                responseText += block.text as string
              }
            }
          }
        }
      }

      clearTimeout(timeout)

      // Parse the JSON response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        res.status(500).json({ error: 'Failed to parse AI response' })
        return
      }

      const result = JSON.parse(jsonMatch[0]) as {
        suggestion: string
        explanation: string
        category: string
      }

      res.json({
        suggestion: result.suggestion,
        explanation: result.explanation,
        category: result.category,
      })
    } catch (err: unknown) {
      clearTimeout(timeout)
      const errStr = String(err)
      if (errStr.includes('aborted') || errStr.includes('AbortError')) {
        res.status(504).json({ error: 'AI improvement timed out' })
        return
      }
      throw err
    }
  } catch (err) {
    res.status(500).json({ error: logError('rules/improve', err) })
  }
})

export default router
