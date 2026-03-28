import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { users, projects } from '../db/schema.js'

// ─── Test project root on real filesystem ────────────────────────────────────

const TEST_ROOT = join(tmpdir(), `ctw-claude-config-test-${Date.now()}`)

// ─── Create test DB up front ─────────────────────────────────────────────────

const { db: testDb, sqlite } = createTestDb()

// ─── Module mocks ────────────────────────────────────────────────────────────

const TEST_TL = { id: 'usr_test_tl', name: 'Test TechLead', role: 'techlead' }
const TEST_DEV = { id: 'usr_test_dev', name: 'Test Dev', role: 'dev' }

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

vi.mock('../utils/log-error.js', () => ({
  logError: vi.fn((_ctx: string, err: unknown) => String(err)),
}))

vi.mock('../db/index.js', () => ({
  db: testDb,
}))

const { createClaudeConfigRouter } = await import('./claude-config.js')

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/claude-config', createClaudeConfigRouter({ db: testDb }))
  return app
}

beforeAll(() => {
  // Create test project directory with .claude structure
  mkdirSync(join(TEST_ROOT, '.claude', 'skills', 'my-skill'), { recursive: true })
  mkdirSync(join(TEST_ROOT, '.claude', 'agents'), { recursive: true })
  mkdirSync(join(TEST_ROOT, '.claude', 'commands'), { recursive: true })

  // Seed DB
  seedTestData(testDb)

  // Add techlead user
  const now = Math.floor(Date.now() / 1000)
  testDb.insert(users).values({
    id: 'usr_test_tl', name: 'Test TechLead', email: 'tl@test.local',
    role: 'techlead', api_key: 'test-api-key-tl', created_at: now, updated_at: now,
  }).run()

  // Update project root to point to our test directory
  testDb.update(projects).set({ project_root: TEST_ROOT }).run()
})

afterAll(() => {
  sqlite.close()
  if (existsSync(TEST_ROOT)) {
    rmSync(TEST_ROOT, { recursive: true })
  }
})

beforeEach(() => {
  currentUser = TEST_TL
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Claude Config route (integration)', () => {
  describe('GET /claude-md', () => {
    it('returns null when CLAUDE.md does not exist', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/claude-config/claude-md')
      expect(res.status).toBe(200)
      expect(res.body.content).toBeNull()
    })

    it('returns content when CLAUDE.md exists', async () => {
      writeFileSync(join(TEST_ROOT, 'CLAUDE.md'), '# Test Project\nRules here', 'utf-8')

      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/claude-config/claude-md')
      expect(res.status).toBe(200)
      expect(res.body.content).toContain('# Test Project')
      expect(res.body.mtime).toBeTypeOf('number')
    })
  })

  describe('PUT /claude-md', () => {
    it('creates CLAUDE.md', async () => {
      const testContent = '# Updated CLAUDE.md\nNew rules'
      const app = createTestApp()
      const res = await request(app)
        .put('/api/projects/proj_test/claude-config/claude-md')
        .send({ content: testContent })

      expect(res.status).toBe(200)
      expect(res.body.content).toBe(testContent)
      expect(res.body.mtime).toBeTypeOf('number')
    })

    it('rejects dev role (403)', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()
      const res = await request(app)
        .put('/api/projects/proj_test/claude-config/claude-md')
        .send({ content: 'Should fail' })
      expect(res.status).toBe(403)
    })
  })

  describe('Skills CRUD', () => {
    it('lists skills', async () => {
      // Create a skill file
      const skillContent = '---\nname: test-skill\ndescription: A test skill\ntriggers: [test]\n---\n\nSkill body'
      writeFileSync(join(TEST_ROOT, '.claude', 'skills', 'my-skill', 'SKILL.md'), skillContent, 'utf-8')

      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/claude-config/skills')
      expect(res.status).toBe(200)
      expect(res.body.skills).toBeInstanceOf(Array)
      expect(res.body.skills.length).toBeGreaterThanOrEqual(1)
    })

    it('creates and reads a skill', async () => {
      const app = createTestApp()
      const content = '---\nname: new-skill\ndescription: Brand new\n---\n\nDo the thing'

      const putRes = await request(app)
        .put('/api/projects/proj_test/claude-config/skills/new-skill')
        .send({ content })
      expect(putRes.status).toBe(200)
      expect(putRes.body.content).toBe(content)

      const getRes = await request(app).get('/api/projects/proj_test/claude-config/skills/new-skill')
      expect(getRes.status).toBe(200)
      expect(getRes.body.content).toBe(content)
    })

    it('deletes a skill', async () => {
      const app = createTestApp()
      const putRes = await request(app)
        .put('/api/projects/proj_test/claude-config/skills/to-delete')
        .send({ content: 'Temporary skill' })
      expect(putRes.status).toBe(200)

      const delRes = await request(app).delete('/api/projects/proj_test/claude-config/skills/to-delete')
      expect(delRes.status).toBe(204)

      const getRes = await request(app).get('/api/projects/proj_test/claude-config/skills/to-delete')
      expect(getRes.status).toBe(404)
    })

    it('rejects invalid skill name', async () => {
      const app = createTestApp()
      const res = await request(app)
        .put('/api/projects/proj_test/claude-config/skills/BAD_NAME')
        .send({ content: 'Should fail' })
      expect(res.status).toBe(400)
    })
  })

  describe('Conflict detection', () => {
    it('returns 409 on mtime conflict', async () => {
      const app = createTestApp()

      // Create a skill
      await request(app)
        .put('/api/projects/proj_test/claude-config/skills/conflict-test')
        .send({ content: 'Version 1' })

      // Read to get mtime
      const getRes = await request(app).get('/api/projects/proj_test/claude-config/skills/conflict-test')
      const mtime = getRes.body.mtime

      // Update with correct mtime (should succeed)
      const okRes = await request(app)
        .put('/api/projects/proj_test/claude-config/skills/conflict-test')
        .send({ content: 'Version 2', expected_mtime: mtime })
      expect(okRes.status).toBe(200)

      // Update with stale mtime (should fail)
      const conflictRes = await request(app)
        .put('/api/projects/proj_test/claude-config/skills/conflict-test')
        .send({ content: 'Version 3', expected_mtime: mtime })
      expect(conflictRes.status).toBe(409)
      expect(conflictRes.body.error).toBe('conflict')
      expect(conflictRes.body.current_content).toBe('Version 2')
    })
  })

  describe('Role gating', () => {
    it('allows dev to read but not write', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()

      // Read should work
      const getRes = await request(app).get('/api/projects/proj_test/claude-config/skills')
      expect(getRes.status).toBe(200)

      // Write should fail
      const putRes = await request(app)
        .put('/api/projects/proj_test/claude-config/skills/dev-skill')
        .send({ content: 'Should fail' })
      expect(putRes.status).toBe(403)

      // Delete should fail
      const delRes = await request(app).delete('/api/projects/proj_test/claude-config/skills/dev-skill')
      expect(delRes.status).toBe(403)
    })
  })
})
