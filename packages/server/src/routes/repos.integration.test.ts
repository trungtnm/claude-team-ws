import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { repos } from '../db/schema.js'

// ─── Create test DB up front ─────────────────────────────────────────────────

const { db: testDb, sqlite } = createTestDb()

// ─── Module mocks ────────────────────────────────────────────────────────────

const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }
const TEST_DEV = { id: 'usr_test_dev', name: 'Test Dev', role: 'dev' }

let currentUser: Express.User = TEST_PM

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

vi.mock('../services/git-service.js', () => ({
  GitService: vi.fn().mockImplementation(() => ({
    clone: vi.fn().mockResolvedValue(undefined),
    branches: vi.fn().mockResolvedValue(['main', 'develop']),
    pull: vi.fn().mockResolvedValue({ updated: true, branch: 'main' }),
  })),
}))

vi.mock('../db/index.js', () => ({
  db: testDb,
}))

const reposModule = await import('./repos.js')
const reposRouter = reposModule.default

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/repos', reposRouter)
  return app
}

beforeAll(() => {
  seedTestData(testDb)
})

afterAll(() => {
  sqlite.close()
})

beforeEach(() => {
  currentUser = TEST_PM
  testDb.delete(repos).run()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Repos route (integration)', () => {
  describe('GET /api/projects/:projectId/repos', () => {
    it('returns empty list when no repos', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/repos')
      expect(res.status).toBe(200)
      expect(res.body.repos).toEqual([])
    })

    it('returns repos for the project', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)
      testDb.insert(repos).values({
        id: 'repo_1', project_id: 'proj_test', name: 'frontend',
        path: '/tmp/frontend', added_by: 'usr_test_pm', created_at: now,
      }).run()

      const res = await request(app).get('/api/projects/proj_test/repos')
      expect(res.status).toBe(200)
      expect(res.body.repos).toHaveLength(1)
      expect(res.body.repos[0].name).toBe('frontend')
    })
  })

  describe('POST /api/projects/:projectId/repos', () => {
    it('creates a repo with link mode', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'my-repo', source_path: '/tmp/my-repo', mode: 'link' })

      expect(res.status).toBe(201)
      expect(res.body.repo).toBeDefined()
      expect(res.body.repo.name).toBe('my-repo')
      expect(res.body.repo.link_mode).toBe('symlink')
      expect(res.body.repo.status).toBe('ready')
    })

    it('rejects duplicate repo name', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)
      testDb.insert(repos).values({
        id: 'repo_1', project_id: 'proj_test', name: 'frontend',
        path: '/tmp/frontend', added_by: 'usr_test_pm', created_at: now,
      }).run()

      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'frontend' })

      expect(res.status).toBe(409)
      expect(res.body.error).toContain('already exists')
    })

    it('rejects dev role (403)', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'should-fail' })

      expect(res.status).toBe(403)
    })

    it('returns 400 for missing name', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({})

      expect(res.status).toBe(400)
    })

    it('rejects non-HTTPS git_url (SSRF prevention)', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'bad-repo', git_url: 'http://github.com/test/repo' })

      expect(res.status).toBe(400)
    })

    it('rejects file:// git_url (SSRF prevention)', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'bad-repo', git_url: 'file:///etc/passwd' })

      expect(res.status).toBe(400)
    })

    it('rejects private IP git_url (SSRF prevention)', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'bad-repo', git_url: 'https://169.254.169.254/latest/meta-data' })

      expect(res.status).toBe(400)
    })

    it('accepts valid HTTPS git_url', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/repos')
        .send({ name: 'good-repo', git_url: 'https://github.com/test/repo.git' })

      expect(res.status).toBe(201)
    })
  })

  describe('DELETE /api/projects/:projectId/repos/:repoName', () => {
    it('deletes a repo and returns 204', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)
      testDb.insert(repos).values({
        id: 'repo_del', project_id: 'proj_test', name: 'to-delete',
        path: '/tmp/to-delete', added_by: 'usr_test_pm', created_at: now,
      }).run()

      const res = await request(app).delete('/api/projects/proj_test/repos/to-delete')
      expect(res.status).toBe(204)

      // Confirm it's gone
      const check = testDb.select().from(repos).all()
      expect(check).toHaveLength(0)
    })

    it('returns 404 for non-existent repo', async () => {
      const app = createTestApp()
      const res = await request(app).delete('/api/projects/proj_test/repos/nonexistent')
      expect(res.status).toBe(404)
    })

    it('rejects dev role (403)', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()
      const res = await request(app).delete('/api/projects/proj_test/repos/some-repo')
      expect(res.status).toBe(403)
    })
  })
})
