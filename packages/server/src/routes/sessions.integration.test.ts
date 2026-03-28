import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData, cleanAllTables } from '../db/test-db.js'
import { sessions, sessionEvents } from '../db/schema.js'
import { eq } from 'drizzle-orm'

// ─── Create test DB up front (before mocks) ─────────────────────────────────

const { db: testDb, sqlite } = createTestDb()

// ─── Module mocks ────────────────────────────────────────────────────────────

const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }
let currentUser: Express.User = TEST_PM

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: () => void) => {
    _req.user = currentUser
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
  emitToSession: vi.fn(),
  getIO: vi.fn(() => ({ on: vi.fn() })),
}))

vi.mock('../services/session-runner.js', () => ({
  getSessionRunner: vi.fn(() => null),
}))

vi.mock('../utils/log-error.js', () => ({
  logError: vi.fn((_ctx: string, err: unknown) => String(err)),
}))

// Mock db module to use test DB
vi.mock('../db/index.js', () => ({
  db: testDb,
}))

// Import AFTER mocks
const sessionsModule = await import('./sessions.js')
const sessionsRouter = sessionsModule.default

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json({ limit: '20mb' }))
  app.use('/api/projects/:projectId/sessions', sessionsRouter)
  return app
}

function insertSession(overrides: Partial<typeof sessions.$inferInsert> = {}): string {
  const id = `sess_${Math.random().toString(36).slice(2, 8)}`
  const now = Math.floor(Date.now() / 1000)
  testDb.insert(sessions).values({
    id,
    project_id: 'proj_test',
    user_id: 'usr_test_pm',
    model: 'sonnet',
    status: 'running',
    permission_mode: 'default',
    prompt: 'Test prompt',
    created_at: now,
    ...overrides,
  }).run()
  return id
}

beforeAll(() => {
  seedTestData(testDb)
})

afterAll(() => {
  sqlite.close()
})

beforeEach(() => {
  currentUser = TEST_PM
  testDb.delete(sessionEvents).run()
  testDb.delete(sessions).run()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Sessions Routes (integration)', () => {
  describe('POST / — create session', () => {
    it('creates a session with default permission mode', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({ prompt: 'Fix the auth bug' })

      expect(res.status).toBe(201)
      expect(res.body.session).toBeDefined()
      expect(res.body.session.status).toBe('queued')
      expect(res.body.session.permission_mode).toBe('default')
      expect(res.body.session.prompt).toBe('Fix the auth bug')
    })

    it('creates a session with permission mode and target dir (techlead)', async () => {
      currentUser = { id: 'usr_test_pm', name: 'Test PM', role: 'techlead' }
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({
          prompt: 'Run tests',
          permission_mode: 'bypassPermissions',
          target_dir: '/tmp/test-project/packages/client',
        })

      expect(res.status).toBe(201)
      expect(res.body.session.permission_mode).toBe('bypassPermissions')
      expect(res.body.session.target_dir).toBe('/tmp/test-project/packages/client')
    })

    it('allows bypassPermissions for non-techlead in safety_mode a (default)', async () => {
      currentUser = TEST_PM // PM role, safety_mode 'a' allows all
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({ prompt: 'Test', permission_mode: 'bypassPermissions' })

      expect(res.status).toBe(201)
      expect(res.body.session.permission_mode).toBe('bypassPermissions')
    })

    it('rejects invalid permission mode', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({ prompt: 'Test', permission_mode: 'invalid' })

      expect(res.status).toBe(400)
    })
  })

  describe('GET / — list sessions', () => {
    it('returns all sessions for a project', async () => {
      insertSession({ status: 'running' })
      insertSession({ status: 'completed' })

      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/sessions')

      expect(res.status).toBe(200)
      expect(res.body.sessions).toHaveLength(2)
    })

    it('filters by status', async () => {
      insertSession({ status: 'running' })
      insertSession({ status: 'completed' })

      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/sessions?status=running')

      expect(res.status).toBe(200)
      expect(res.body.sessions).toHaveLength(1)
      expect(res.body.sessions[0].status).toBe('running')
    })
  })

  describe('POST /:sessionId/complete — complete idle session', () => {
    it('completes an idle session', async () => {
      const id = insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/complete`)

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('completed')
      expect(res.body.session.finished_at).toBeDefined()
    })

    it('rejects completing a running session', async () => {
      const id = insertSession({ status: 'running' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/complete`)

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('idle')
    })
  })

  describe('POST /:sessionId/cancel — cancel session', () => {
    it('cancels an idle session', async () => {
      const id = insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/cancel`)

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('cancelled')
    })

    it('cancels a queued session', async () => {
      const id = insertSession({ status: 'queued' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/cancel`)

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('cancelled')
    })

    it('cancels idle session (terminal)', async () => {
      const id = insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/cancel`)

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('cancelled')
    })

    it('rejects cancelling a completed session', async () => {
      const id = insertSession({ status: 'completed' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/cancel`)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /:sessionId/interrupt — interrupt agent', () => {
    it('interrupts a running session to idle', async () => {
      const id = insertSession({ status: 'running' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/interrupt`)

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('idle')
    })

    it('rejects interrupting an idle session', async () => {
      const id = insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/interrupt`)

      expect(res.status).toBe(400)
    })

    it('rejects interrupting a completed session', async () => {
      const id = insertSession({ status: 'completed' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/interrupt`)

      expect(res.status).toBe(400)
    })
  })

  describe('POST /:sessionId/message — send follow-up', () => {
    it('accepts message for idle session', async () => {
      const id = insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app)
        .post(`/api/projects/proj_test/sessions/${id}/message`)
        .send({ message: 'Follow up on the task' })

      expect(res.status).toBe(200)
    })

    it('accepts message with attachments', async () => {
      const id = insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app)
        .post(`/api/projects/proj_test/sessions/${id}/message`)
        .send({
          message: 'Here is the screenshot',
          attachments: [{
            type: 'image',
            name: 'screenshot.png',
            mimeType: 'image/png',
            data: 'iVBORw0KGgo=',
          }],
        })

      expect(res.status).toBe(200)
    })

    it('rejects message for completed session', async () => {
      const id = insertSession({ status: 'completed' })

      const app = createTestApp()
      const res = await request(app)
        .post(`/api/projects/proj_test/sessions/${id}/message`)
        .send({ message: 'This should fail' })

      expect(res.status).toBe(400)
    })
  })

  describe('POST /:sessionId/permission-mode — change mode', () => {
    it('updates permission mode', async () => {
      const id = insertSession({ permission_mode: 'default' })

      const app = createTestApp()
      const res = await request(app)
        .post(`/api/projects/proj_test/sessions/${id}/permission-mode`)
        .send({ mode: 'bypassPermissions' })

      expect(res.status).toBe(200)
      expect(res.body.mode).toBe('bypassPermissions')
    })

    it('rejects invalid mode', async () => {
      const id = insertSession()

      const app = createTestApp()
      const res = await request(app)
        .post(`/api/projects/proj_test/sessions/${id}/permission-mode`)
        .send({ mode: 'invalidMode' })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /:sessionId — delete session', () => {
    it('deletes a session and its events', async () => {
      const id = insertSession({ status: 'completed' })
      testDb.insert(sessionEvents).values({
        session_id: id,
        event_type: 'system',
        data: JSON.stringify({ content: 'test' }),
      }).run()

      const app = createTestApp()
      const res = await request(app).delete(`/api/projects/proj_test/sessions/${id}`)

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('deleted')

      const remaining = testDb.select().from(sessions).where(eq(sessions.id, id)).get()
      expect(remaining).toBeUndefined()

      const remainingEvents = testDb.select().from(sessionEvents).where(eq(sessionEvents.session_id, id)).all()
      expect(remainingEvents).toHaveLength(0)
    })
  })

  describe('DELETE / — bulk delete', () => {
    it('deletes completed/failed/cancelled sessions', async () => {
      insertSession({ status: 'completed' })
      insertSession({ status: 'failed' })
      insertSession({ status: 'cancelled' })
      insertSession({ status: 'running' })
      insertSession({ status: 'idle' })

      const app = createTestApp()
      const res = await request(app).delete('/api/projects/proj_test/sessions')

      expect(res.status).toBe(200)

      const remaining = testDb.select().from(sessions).all()
      expect(remaining).toHaveLength(2)
      expect(remaining.every((s) => s.status === 'running' || s.status === 'idle')).toBe(true)
    })
  })

  describe('GET /capabilities', () => {
    it('returns empty capabilities when no sessions have run', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/sessions/capabilities')

      expect(res.status).toBe(200)
      expect(res.body.capabilities).toBeDefined()
      expect(res.body.capabilities.commands).toEqual([])
    })
  })

  describe('GET /:sessionId/events', () => {
    it('returns events for a session', async () => {
      const id = insertSession()
      testDb.insert(sessionEvents).values([
        { session_id: id, event_type: 'system', data: '{"content":"started"}' },
        { session_id: id, event_type: 'assistant', data: '{"content":"hello"}' },
      ]).run()

      const app = createTestApp()
      const res = await request(app).get(`/api/projects/proj_test/sessions/${id}/events`)

      expect(res.status).toBe(200)
      expect(res.body.events).toHaveLength(2)
      expect(res.body.events[0].data.content).toBe('started')
    })
  })

  // ─── Security: path traversal ──────────────────────────────────────────────

  describe('POST / — target_dir validation', () => {
    it('rejects target_dir outside project root', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({
          prompt: 'test',
          target_dir: '/etc/passwd',
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('project root')
    })

    it('rejects target_dir with path traversal', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({
          prompt: 'test',
          target_dir: '/tmp/test-project/../../etc',
        })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('project root')
    })

    it('accepts target_dir within project root', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/sessions')
        .send({
          prompt: 'test',
          target_dir: '/tmp/test-project/packages/server',
        })

      expect(res.status).toBe(201)
    })
  })

  // ─── Security: session ownership ───────────────────────────────────────────

  describe('Session ownership checks', () => {
    it('prevents non-owner from cancelling session', async () => {
      const id = insertSession({ user_id: 'usr_test_dev' })
      currentUser = TEST_PM // PM trying to cancel dev's session

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/cancel`)

      expect(res.status).toBe(403)
      expect(res.body.error).toContain('session owner')
    })

    it('allows session owner to cancel their own session', async () => {
      const id = insertSession({ user_id: 'usr_test_pm' })

      const app = createTestApp()
      const res = await request(app).post(`/api/projects/proj_test/sessions/${id}/cancel`)

      expect(res.status).toBe(200)
    })

    it('prevents non-owner from deleting session', async () => {
      const id = insertSession({ user_id: 'usr_test_dev', status: 'completed' })
      currentUser = TEST_PM

      const app = createTestApp()
      const res = await request(app).delete(`/api/projects/proj_test/sessions/${id}`)

      expect(res.status).toBe(403)
    })
  })
})
