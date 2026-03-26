import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { captures, activityLog } from '../db/schema.js'
import type { BeadsService } from '../services/beads-service.js'

// ─── Test users ───────────────────────────────────────────────────────────────

const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }

// ─── Module mocks (must be before imports that use them) ──────────────────────

// Track current test user — can be changed per test
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

// Import AFTER mocks are set up
const { createCapturesRouter } = await import('./captures.js')

// ─── Test app factory ─────────────────────────────────────────────────────────

function createTestApp(db: ReturnType<typeof createTestDb>['db']) {
  const app = express()
  app.use(express.json())

  const mockBeadsService = {
    create: vi.fn().mockResolvedValue('bead-123'),
    show: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(undefined),
    addDependency: vi.fn().mockResolvedValue(undefined),
  } as unknown as BeadsService

  app.use('/api/projects/:projectId/captures', createCapturesRouter({ db, beadsService: mockBeadsService }))

  return { app, mockBeadsService }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Captures route (integration)', () => {
  const { db, sqlite } = createTestDb()

  beforeAll(() => {
    seedTestData(db)
  })

  beforeEach(() => {
    currentUser = TEST_PM
    db.delete(activityLog).run()
    db.delete(captures).run()
  })

  afterAll(() => {
    sqlite.close()
  })

  describe('POST /api/projects/:projectId/captures', () => {
    it('should create a capture and return 201', async () => {
      const { app } = createTestApp(db)
      const res = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'Add dark mode toggle to settings' })
        .expect(201)

      expect(res.body.capture).toBeDefined()
      expect(res.body.capture.text).toBe('Add dark mode toggle to settings')
      expect(res.body.capture.status).toBe('pending')
      expect(res.body.capture.user_id).toBe('usr_test_pm')
      expect(res.body.capture.project_id).toBe('proj_test')
    })

    it('should return 400 for missing text', async () => {
      const { app } = createTestApp(db)
      const res = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({})
        .expect(400)

      expect(res.body.error).toBe('Validation failed')
      expect(res.body.issues).toBeDefined()
    })

    it('should return 400 for empty text', async () => {
      const { app } = createTestApp(db)
      await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: '' })
        .expect(400)
    })
  })

  describe('GET /api/projects/:projectId/captures', () => {
    it('should list captures for a project', async () => {
      const { app } = createTestApp(db)

      await request(app).post('/api/projects/proj_test/captures').send({ text: 'First idea' })
      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Second idea' })

      const res = await request(app)
        .get('/api/projects/proj_test/captures')
        .expect(200)

      expect(res.body.captures).toHaveLength(2)
    })

    it('should filter by status', async () => {
      const { app } = createTestApp(db)

      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Pending one' })

      const res = await request(app)
        .get('/api/projects/proj_test/captures?status=triaged')
        .expect(200)

      expect(res.body.captures).toHaveLength(0)
    })

    it('should return empty array for project with no captures', async () => {
      const { app } = createTestApp(db)

      const res = await request(app)
        .get('/api/projects/proj_test/captures')
        .expect(200)

      expect(res.body.captures).toHaveLength(0)
    })

    it('should respect limit parameter', async () => {
      const { app } = createTestApp(db)

      await request(app).post('/api/projects/proj_test/captures').send({ text: 'One' })
      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Two' })
      await request(app).post('/api/projects/proj_test/captures').send({ text: 'Three' })

      const res = await request(app)
        .get('/api/projects/proj_test/captures?limit=2')
        .expect(200)

      expect(res.body.captures).toHaveLength(2)
    })
  })

  describe('PATCH /api/projects/:projectId/captures/:captureId', () => {
    it('should update capture text (PM role)', async () => {
      const { app } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'Original idea' })
      const captureId = createRes.body.capture.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/captures/${captureId}`)
        .send({ text: 'Updated idea' })
        .expect(200)

      expect(res.body.capture.text).toBe('Updated idea')
    })

    it('should triage capture to triaged status', async () => {
      const { app } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'Raw idea' })
      const captureId = createRes.body.capture.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/captures/${captureId}`)
        .send({ status: 'triaged', triage_result: 'Convert to epic' })
        .expect(200)

      expect(res.body.capture.status).toBe('triaged')
      expect(res.body.capture.triage_result).toBe('Convert to epic')
      expect(res.body.capture.triaged_at).toBeDefined()
      expect(res.body.capture.triaged_by).toBe('usr_test_pm')
    })

    it('should return 404 for non-existent capture', async () => {
      const { app } = createTestApp(db)
      await request(app)
        .patch('/api/projects/proj_test/captures/nonexistent')
        .send({ text: 'Updated' })
        .expect(404)
    })

    it('should reject dev role (403)', async () => {
      currentUser = { id: 'usr_test_dev', name: 'Test Dev', role: 'dev' }
      const { app } = createTestApp(db)

      await request(app)
        .patch('/api/projects/proj_test/captures/any-id')
        .send({ text: 'Updated' })
        .expect(403)
    })
  })

  describe('DELETE /api/projects/:projectId/captures/:captureId', () => {
    it('should delete a capture and return 204', async () => {
      const { app } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/captures')
        .send({ text: 'To be deleted' })
      const captureId = createRes.body.capture.id

      await request(app)
        .delete(`/api/projects/proj_test/captures/${captureId}`)
        .expect(204)

      // Verify it's gone
      const listRes = await request(app)
        .get('/api/projects/proj_test/captures')
        .expect(200)
      expect(listRes.body.captures).toHaveLength(0)
    })

    it('should return 404 for non-existent capture', async () => {
      const { app } = createTestApp(db)
      await request(app)
        .delete('/api/projects/proj_test/captures/nonexistent')
        .expect(404)
    })
  })
})
