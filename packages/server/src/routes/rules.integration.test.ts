import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { knowledgeRules, users } from '../db/schema.js'

// ─── Create test DB up front ─────────────────────────────────────────────────

const { db: testDb, sqlite } = createTestDb()

// ─── Module mocks ────────────────────────────────────────────────────────────

const TEST_TL = { id: 'usr_test_tl', name: 'Test TechLead', role: 'techlead' }
const TEST_DEV = { id: 'usr_test_dev', name: 'Test Dev', role: 'dev' }
const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }

let currentUser: Express.User = TEST_TL

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: () => void) => {
    _req.user = currentUser
    next()
  }),
  requireRole: (..._roles: string[]) =>
    vi.fn((req: any, res: any, next: () => void) => {
      const user = req.user as { role: string } | undefined
      if (!user || !_roles.includes(user.role)) {
        res.status(403).json({ error: 'Insufficient permissions' })
        return
      }
      next()
    }),
}))

vi.mock('../middleware/project-access.js', () => ({
  requireProjectMember: vi.fn((req: any, _res: any, next: () => void) => {
    const pid = req.params.projectId
    req.params.projectId = Array.isArray(pid) ? pid[0] : pid ?? ''
    next()
  }),
}))

vi.mock('../services/socket-manager.js', () => ({
  emitToProject: vi.fn(),
}))

vi.mock('../utils/log-error.js', () => ({
  logError: vi.fn((_ctx: string, err: unknown) => String(err)),
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}))

vi.mock('../db/index.js', () => ({
  db: testDb,
}))

const rulesModule = await import('./rules.js')
const rulesRouter = rulesModule.default

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/rules', rulesRouter)
  return app
}

beforeAll(() => {
  seedTestData(testDb)
  // Add techlead user for rule creation
  const now = Math.floor(Date.now() / 1000)
  testDb.insert(users).values({
    id: 'usr_test_tl', name: 'Test TechLead', email: 'tl@test.local',
    role: 'techlead', api_key: 'test-api-key-tl', created_at: now, updated_at: now,
  }).run()
})

afterAll(() => {
  sqlite.close()
})

beforeEach(() => {
  currentUser = TEST_TL
  testDb.delete(knowledgeRules).run()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Rules route (integration)', () => {
  describe('GET /api/projects/:projectId/rules', () => {
    it('returns empty list when no rules', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/rules')
      expect(res.status).toBe(200)
      expect(res.body.rules).toEqual([])
    })

    it('returns rules and filters by category', async () => {
      const app = createTestApp()

      // Create two rules
      await request(app).post('/api/projects/proj_test/rules').send({
        rule_text: 'Always use strict mode', category: 'coding',
      })
      await request(app).post('/api/projects/proj_test/rules').send({
        rule_text: 'Never expose API keys', category: 'security',
      })

      // Get all
      const all = await request(app).get('/api/projects/proj_test/rules')
      expect(all.status).toBe(200)
      expect(all.body.rules).toHaveLength(2)

      // Filter by category
      const coding = await request(app).get('/api/projects/proj_test/rules?category=coding')
      expect(coding.body.rules).toHaveLength(1)
      expect(coding.body.rules[0].rule_text).toBe('Always use strict mode')
    })
  })

  describe('POST /api/projects/:projectId/rules', () => {
    it('creates a rule with defaults', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({ rule_text: 'Use zod for all validation' })

      expect(res.status).toBe(201)
      expect(res.body.rule).toBeDefined()
      expect(res.body.rule.rule_text).toBe('Use zod for all validation')
      expect(res.body.rule.category).toBe('general')
      expect(res.body.rule.confidence).toBe(0.5)
      expect(res.body.rule.maturity).toBe('candidate')
      expect(res.body.rule.source).toBe('manual')
      expect(res.body.rule.approved_by).toBe('usr_test_tl')
    })

    it('creates a rule with all fields', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({
          rule_text: 'Always write integration tests',
          category: 'testing',
          confidence: 0.9,
          maturity: 'proven',
          source: 'auto',
        })

      expect(res.status).toBe(201)
      expect(res.body.rule.category).toBe('testing')
      expect(res.body.rule.confidence).toBe(0.9)
      expect(res.body.rule.maturity).toBe('proven')
    })

    it('rejects dev role (403)', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({ rule_text: 'Should fail' })
      expect(res.status).toBe(403)
    })

    it('rejects pm role (403)', async () => {
      currentUser = TEST_PM
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({ rule_text: 'Should fail' })
      expect(res.status).toBe(403)
    })

    it('returns 400 for empty rule_text', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({})
      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/projects/:projectId/rules/:ruleId', () => {
    it('updates rule fields', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({ rule_text: 'Original rule' })
      const ruleId = createRes.body.rule.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/rules/${ruleId}`)
        .send({ rule_text: 'Updated rule', category: 'security', confidence: 0.8 })

      expect(res.status).toBe(200)
      expect(res.body.rule.rule_text).toBe('Updated rule')
      expect(res.body.rule.category).toBe('security')
      expect(res.body.rule.confidence).toBe(0.8)
    })

    it('returns 404 for non-existent rule', async () => {
      const app = createTestApp()
      const res = await request(app)
        .patch('/api/projects/proj_test/rules/nonexistent')
        .send({ rule_text: 'Update' })
      expect(res.status).toBe(404)
    })
  })

  describe('DELETE /api/projects/:projectId/rules/:ruleId', () => {
    it('deletes a rule and returns 204', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/rules')
        .send({ rule_text: 'To be deleted' })
      const ruleId = createRes.body.rule.id

      const res = await request(app).delete(`/api/projects/proj_test/rules/${ruleId}`)
      expect(res.status).toBe(204)

      // Confirm it's gone
      const check = testDb.select().from(knowledgeRules).all()
      expect(check).toHaveLength(0)
    })

    it('returns 404 for non-existent rule', async () => {
      const app = createTestApp()
      const res = await request(app).delete('/api/projects/proj_test/rules/nonexistent')
      expect(res.status).toBe(404)
    })
  })
})
