import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { captures, activityLog } from '../db/schema.js'

// ─── Create test DB up front ─────────────────────────────────────────────────

const { db: testDb, sqlite } = createTestDb()

// ─── Module mocks ────────────────────────────────────────────────────────────

const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }
const TEST_DEV = { id: 'usr_test_dev', name: 'Test Dev', role: 'dev' }
const TEST_VIEWER = { id: 'usr_test_viewer', name: 'Test Viewer', role: 'viewer' }

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

vi.mock('../db/index.js', () => ({
  db: testDb,
}))

const capturesModule = await import('./captures.js')
const capturesRouter = capturesModule.default

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/captures', capturesRouter)
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
  testDb.delete(activityLog).run()
  testDb.delete(captures).run()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Captures route (integration)', () => {
  describe('POST /api/projects/:projectId/captures', () => {
    it('creates a capture', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'New idea for the dashboard' })

      expect(res.status).toBe(201)
      expect(res.body.capture).toBeDefined()
      expect(res.body.capture.text).toBe('New idea for the dashboard')
      expect(res.body.capture.status).toBe('pending')
    })

    it('returns 400 for empty text', async () => {
      const app = createTestApp()
      await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: '' })
        .expect(400)
    })

    it('logs activity', async () => {
      const app = createTestApp()
      await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'Activity test' })

      const logs = testDb.select().from(activityLog).all()
      expect(logs).toHaveLength(1)
      expect(logs[0].action).toBe('capture_created')
    })
  })

  describe('GET /api/projects/:projectId/captures', () => {
    it('lists captures', async () => {
      const app = createTestApp()
      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Capture 1' })
      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Capture 2' })

      const res = await request(app).get('/api/projects/proj_test/captures')

      expect(res.status).toBe(200)
      expect(res.body.captures).toHaveLength(2)
    })

    it('filters by status', async () => {
      const app = createTestApp()
      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Pending one' })

      const res = await request(app).get('/api/projects/proj_test/captures?status=triaged')

      expect(res.status).toBe(200)
      expect(res.body.captures).toHaveLength(0)
    })
  })

  describe('PATCH /api/projects/:projectId/captures/:captureId', () => {
    it('triages a capture', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'To be triaged' })
      const captureId = createRes.body.capture.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/captures/${captureId}`)
        .send({ status: 'triaged', triage_result: 'Created epic' })

      expect(res.status).toBe(200)
      expect(res.body.capture.status).toBe('triaged')
      expect(res.body.capture.triage_result).toBe('Created epic')
      expect(res.body.capture.triaged_at).toBeDefined()
      expect(res.body.capture.triaged_by).toBe('usr_test_pm')
    })

    it('defers a capture', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'To be deferred' })
      const captureId = createRes.body.capture.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/captures/${captureId}`)
        .send({ status: 'deferred' })

      expect(res.status).toBe(200)
      expect(res.body.capture.status).toBe('deferred')
    })

    it('rejects dev role', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()

      // Create as PM first
      currentUser = TEST_PM
      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'Dev cannot triage' })
      const captureId = createRes.body.capture.id

      currentUser = TEST_DEV
      await request(app)
        .patch(`/api/projects/proj_test/captures/${captureId}`)
        .send({ status: 'triaged' })
        .expect(403)
    })

    it('returns 404 for non-existent capture', async () => {
      const app = createTestApp()
      await request(app)
        .patch('/api/projects/proj_test/captures/nonexistent')
        .send({ status: 'triaged' })
        .expect(404)
    })
  })

  describe('DELETE /api/projects/:projectId/captures/:captureId', () => {
    it('deletes a capture', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'To delete' })
      const captureId = createRes.body.capture.id

      await request(app)
        .delete(`/api/projects/proj_test/captures/${captureId}`)
        .expect(204)

      // Verify deleted
      const remaining = testDb.select().from(captures).all()
      expect(remaining).toHaveLength(0)
    })

    it('returns 404 for non-existent capture', async () => {
      const app = createTestApp()
      await request(app)
        .delete('/api/projects/proj_test/captures/nonexistent')
        .expect(404)
    })
  })
})
