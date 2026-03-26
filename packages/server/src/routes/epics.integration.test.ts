import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { epics, sessions, activityLog } from '../db/schema.js'
import type { BeadsService } from '../services/beads-service.js'

// ─── Test users ───────────────────────────────────────────────────────────────

const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }
const TEST_DEV = { id: 'usr_test_dev', name: 'Test Dev', role: 'dev' }

let currentUser: Express.User = TEST_PM

// ─── Module mocks ─────────────────────────────────────────────────────────────

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

const { createEpicsRouter } = await import('./epics.js')

// ─── Test app factory ─────────────────────────────────────────────────────────

let beadCounter = 0

function createTestApp(db: ReturnType<typeof createTestDb>['db']) {
  const app = express()
  app.use(express.json())

  const mockBeadsService = {
    create: vi.fn().mockImplementation(async () => `bead-${++beadCounter}`),
    show: vi.fn().mockImplementation(async (id: string) => ({
      id,
      title: `Mock bead ${id}`,
      description: 'Test description',
      priority: 2,
      type: 'epic',
      status: 'open',
      labels: ['test'],
    })),
    update: vi.fn().mockResolvedValue(undefined),
    addDependency: vi.fn().mockResolvedValue(undefined),
  } as unknown as BeadsService

  app.use('/api/projects/:projectId/epics', createEpicsRouter({ db, beadsService: mockBeadsService }))

  return { app, mockBeadsService }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Epics route (integration)', () => {
  const { db, sqlite } = createTestDb()

  beforeAll(() => {
    seedTestData(db)
  })

  beforeEach(() => {
    currentUser = TEST_PM
    beadCounter = 0
    db.delete(activityLog).run()
    db.delete(sessions).run()
    db.delete(epics).run()
  })

  afterAll(() => {
    sqlite.close()
  })

  describe('POST /api/projects/:projectId/epics', () => {
    it('should create an epic (PM role)', async () => {
      const { app, mockBeadsService } = createTestApp(db)

      const res = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Add user dashboard', description: 'Dashboard with stats' })
        .expect(201)

      expect(res.body.epic).toBeDefined()
      expect(res.body.epic.project_id).toBe('proj_test')
      expect(res.body.epic.ui_status).toBe('ready')
      expect(res.body.epic.bead).toBeDefined()
      expect(res.body.epic.activeSession).toBeNull()
      expect(mockBeadsService.create).toHaveBeenCalledWith({
        title: 'Add user dashboard',
        type: 'epic',
        priority: 2,
        labels: undefined,
        description: 'Dashboard with stats',
      })
    })

    it('should reject dev role (403)', async () => {
      currentUser = TEST_DEV
      const { app } = createTestApp(db)

      await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Should fail' })
        .expect(403)
    })

    it('should return 400 for missing title', async () => {
      const { app } = createTestApp(db)

      await request(app)
        .post('/api/projects/proj_test/epics')
        .send({})
        .expect(400)
    })

    it('should accept optional fields', async () => {
      const { app } = createTestApp(db)

      const res = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({
          title: 'Full featured epic',
          description: 'Detailed description',
          priority: 1,
          labels: ['backend', 'urgent'],
          git_branches: ['epic/dashboard'],
        })
        .expect(201)

      expect(res.body.epic.git_branches).toEqual(['epic/dashboard'])
    })
  })

  describe('GET /api/projects/:projectId/epics', () => {
    it('should list epics with bead data', async () => {
      const { app } = createTestApp(db)

      await request(app).post('/api/projects/proj_test/epics').send({ title: 'Epic 1' })
      await request(app).post('/api/projects/proj_test/epics').send({ title: 'Epic 2' })

      const res = await request(app)
        .get('/api/projects/proj_test/epics')
        .expect(200)

      expect(res.body.epics).toHaveLength(2)
      expect(res.body.epics[0].bead).toBeDefined()
      expect(res.body.epics[0].activeSession).toBeNull()
    })

    it('should include activeSession when a session is running', async () => {
      const { app } = createTestApp(db)

      // Create epic
      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Epic with session' })
      const epicId = createRes.body.epic.id

      // Insert a running session directly
      const now = Math.floor(Date.now() / 1000)
      db.insert(sessions).values({
        id: 'sess_test_1',
        project_id: 'proj_test',
        epic_id: epicId,
        user_id: 'usr_test_pm',
        model: 'opus',
        status: 'running',
        prompt: 'Test prompt',
        created_at: now,
      }).run()

      const res = await request(app)
        .get('/api/projects/proj_test/epics')
        .expect(200)

      const epic = res.body.epics.find((e: { id: string }) => e.id === epicId)
      expect(epic.activeSession).toBeDefined()
      expect(epic.activeSession.id).toBe('sess_test_1')
      expect(epic.activeSession.status).toBe('running')
      expect(epic.activeSession.model).toBe('opus')
    })

    it('should NOT include completed sessions as activeSession', async () => {
      const { app } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Epic with completed session' })
      const epicId = createRes.body.epic.id

      const now = Math.floor(Date.now() / 1000)
      db.insert(sessions).values({
        id: 'sess_done',
        project_id: 'proj_test',
        epic_id: epicId,
        user_id: 'usr_test_pm',
        model: 'sonnet',
        status: 'completed',
        prompt: 'Done prompt',
        created_at: now,
      }).run()

      const res = await request(app)
        .get('/api/projects/proj_test/epics')
        .expect(200)

      const epic = res.body.epics.find((e: { id: string }) => e.id === epicId)
      expect(epic.activeSession).toBeNull()
    })
  })

  describe('GET /api/projects/:projectId/epics/:epicId', () => {
    it('should return epic detail with sessions', async () => {
      const { app } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Detail epic' })
      const epicId = createRes.body.epic.id

      const res = await request(app)
        .get(`/api/projects/proj_test/epics/${epicId}`)
        .expect(200)

      expect(res.body.epic.id).toBe(epicId)
      expect(res.body.epic.sessions).toBeDefined()
      expect(res.body.epic.sessions).toHaveLength(0)
      expect(res.body.epic.activeSession).toBeNull()
    })

    it('should return 404 for non-existent epic', async () => {
      const { app } = createTestApp(db)

      await request(app)
        .get('/api/projects/proj_test/epics/nonexistent')
        .expect(404)
    })
  })

  describe('PATCH /api/projects/:projectId/epics/:epicId', () => {
    it('should update epic ui_status', async () => {
      const { app } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Status update test' })
      const epicId = createRes.body.epic.id

      const res = await request(app)
        .patch(`/api/projects/proj_test/epics/${epicId}`)
        .send({ ui_status: 'in_progress' })
        .expect(200)

      expect(res.body.epic.ui_status).toBe('in_progress')
    })

    it('should update bead-level fields via service', async () => {
      const { app, mockBeadsService } = createTestApp(db)

      const createRes = await request(app)
        .post('/api/projects/proj_test/epics')
        .send({ title: 'Bead update test' })
      const epicId = createRes.body.epic.id

      await request(app)
        .patch(`/api/projects/proj_test/epics/${epicId}`)
        .send({ bead_priority: 0, bead_labels: ['critical'] })
        .expect(200)

      expect(mockBeadsService.update).toHaveBeenCalled()
    })

    it('should return 404 for non-existent epic', async () => {
      const { app } = createTestApp(db)

      await request(app)
        .patch('/api/projects/proj_test/epics/nonexistent')
        .send({ ui_status: 'done' })
        .expect(404)
    })

    it('should return 400 for invalid ui_status', async () => {
      const { app } = createTestApp(db)

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
