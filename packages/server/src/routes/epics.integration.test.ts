import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData, cleanAllTables } from '../db/test-db.js'
import { epics, sessions, activityLog } from '../db/schema.js'

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

vi.mock('../db/index.js', () => ({
  db: testDb,
}))

const epicsModule = await import('./epics.js')
const epicsRouter = epicsModule.default

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/epics', epicsRouter)
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
  testDb.delete(sessions).run()
  testDb.delete(epics).run()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Epics route (integration)', () => {
  describe('POST /api/projects/:projectId/epics', () => {
    it('creates an epic with all fields', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({
          title: 'Add user dashboard',
          description: 'Dashboard with stats',
          priority: 1,
          type: 'feature',
          labels: ['backend', 'urgent'],
        })

      expect(res.status).toBe(201)
      expect(res.body.epic).toBeDefined()
      expect(res.body.epic.title).toBe('Add user dashboard')
      expect(res.body.epic.description).toBe('Dashboard with stats')
      expect(res.body.epic.priority).toBe(1)
      expect(res.body.epic.type).toBe('feature')
      expect(res.body.epic.labels).toEqual(['backend', 'urgent'])
      expect(res.body.epic.ui_status).toBe('ready')
      expect(res.body.epic.activeSession).toBeNull()
    })

    it('rejects dev role (403)', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()
      await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Should fail' })
        .expect(403)
    })

    it('returns 400 for missing title', async () => {
      const app = createTestApp()
      await request(app)
        .post('/api/projects/proj_test/epics')
        .send({})
        .expect(400)
    })
  })

  describe('GET /api/projects/:projectId/epics', () => {
    it('lists epics with inline data', async () => {
      const app = createTestApp()
      await request(app).post('/api/projects/proj_test/epics').send({ title: 'Epic 1' })
      await request(app).post('/api/projects/proj_test/epics').send({ title: 'Epic 2' })

      const res = await request(app).get('/api/projects/proj_test/epics')

      expect(res.status).toBe(200)
      expect(res.body.epics).toHaveLength(2)
      expect(res.body.epics[0].title).toBeDefined()
      expect(res.body.epics[0].activeSession).toBeNull()
    })

    it('includes activeSession when a session is running', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Epic with session' })
      const epicId = createRes.body.epic.id

      const now = Math.floor(Date.now() / 1000)
      testDb.insert(sessions).values({
        id: 'sess_test_1',
        project_id: 'proj_test',
        epic_id: epicId,
        user_id: 'usr_test_pm',
        model: 'opus',
        status: 'running',
        permission_mode: 'default',
        prompt: 'Test prompt',
        created_at: now,
      }).run()

      const res = await request(app).get('/api/projects/proj_test/epics')
      const epic = res.body.epics.find((e: { id: string }) => e.id === epicId)
      expect(epic.activeSession).toBeDefined()
      expect(epic.activeSession.id).toBe('sess_test_1')
      expect(epic.activeSession.status).toBe('running')
    })
  })

  describe('GET /api/projects/:projectId/epics/:epicId', () => {
    it('returns epic detail with sessions', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Detail epic' })
      const epicId = createRes.body.epic.id

      const res = await request(app).get(`/api/projects/proj_test/epics/${epicId}`)

      expect(res.status).toBe(200)
      expect(res.body.epic.id).toBe(epicId)
      expect(res.body.epic.title).toBe('Detail epic')
      expect(res.body.epic.sessions).toHaveLength(0)
    })

    it('returns 404 for non-existent epic', async () => {
      const app = createTestApp()
      await request(app).get('/api/projects/proj_test/epics/nonexistent').expect(404)
    })
  })

  describe('PATCH /api/projects/:projectId/epics/:epicId', () => {
    it('updates epic fields directly', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Update test' })
      const epicId = createRes.body.epic.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/epics/${epicId}`)
        .send({ ui_status: 'in_progress', priority: 0, labels: ['critical'] })

      expect(res.status).toBe(200)
      expect(res.body.epic.ui_status).toBe('in_progress')
      expect(res.body.epic.priority).toBe(0)
      expect(res.body.epic.labels).toEqual(['critical'])
    })

    it('returns 404 for non-existent epic', async () => {
      const app = createTestApp()
      await request(app)
        .patch('/api/projects/proj_test/epics/nonexistent')
        .send({ ui_status: 'done' })
        .expect(404)
    })

    it('returns 400 for invalid ui_status', async () => {
      const app = createTestApp()
      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Validation test' })
      const epicId = createRes.body.epic.id

      await request(app)
        .patch(`/api/projects/proj_test/epics/${epicId}`)
        .send({ ui_status: 'invalid_status' })
        .expect(400)
    })
  })
})
