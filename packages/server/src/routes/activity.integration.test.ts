import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { activityLog, sessions, captures, epics } from '../db/schema.js'

// ─── Test users ───────────────────────────────────────────────────────────────

const TEST_PM = { id: 'usr_test_pm', name: 'Test PM', role: 'pm' }

// ─── Module mocks (must be before imports that use them) ──────────────────────

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

// Import AFTER mocks are set up
const { createActivityRouter } = await import('./activity.js')

// ─── Test app factory ─────────────────────────────────────────────────────────

function createTestApp(db: ReturnType<typeof createTestDb>['db']) {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/activity', createActivityRouter({ db }))
  return app
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Activity route (integration)', () => {
  const { db } = createTestDb()

  beforeAll(() => {
    seedTestData(db)
  })

  beforeEach(() => {
    currentUser = TEST_PM
    db.delete(activityLog).run()
    db.delete(sessions).run()
    db.delete(captures).run()
    db.delete(epics).run()
  })

  // ─── GET / (activity feed) ─────────────────────────────────────────────────

  describe('GET /api/projects/:projectId/activity', () => {
    it('returns empty list when no activity', async () => {
      const app = createTestApp(db)
      const res = await request(app).get('/api/projects/proj_test/activity')
      expect(res.status).toBe(200)
      expect(res.body.activity).toEqual([])
      expect(res.body.total).toBe(0)
    })

    it('returns activity entries with user name', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      db.insert(activityLog).values({
        project_id: 'proj_test',
        user_id: 'usr_test_pm',
        action: 'capture_created',
        details: JSON.stringify({ capture_id: 'cap_1' }),
        created_at: now,
      }).run()

      db.insert(activityLog).values({
        project_id: 'proj_test',
        user_id: 'usr_test_dev',
        action: 'session_started',
        details: JSON.stringify({ session_id: 'sess_1' }),
        created_at: now + 1,
      }).run()

      const res = await request(app).get('/api/projects/proj_test/activity')
      expect(res.status).toBe(200)
      expect(res.body.activity).toHaveLength(2)
      expect(res.body.total).toBe(2)

      // Most recent first
      expect(res.body.activity[0].action).toBe('session_started')
      expect(res.body.activity[0].user_name).toBe('Test Dev')
      expect(res.body.activity[1].action).toBe('capture_created')
      expect(res.body.activity[1].user_name).toBe('Test PM')
    })

    it('filters by action', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      db.insert(activityLog).values([
        { project_id: 'proj_test', user_id: 'usr_test_pm', action: 'capture_created', created_at: now },
        { project_id: 'proj_test', user_id: 'usr_test_pm', action: 'epic_created', created_at: now },
        { project_id: 'proj_test', user_id: 'usr_test_pm', action: 'capture_created', created_at: now },
      ]).run()

      const res = await request(app).get('/api/projects/proj_test/activity?action=capture_created')
      expect(res.status).toBe(200)
      expect(res.body.activity).toHaveLength(2)
      expect(res.body.total).toBe(2)
      expect(res.body.activity.every((a: any) => a.action === 'capture_created')).toBe(true)
    })

    it('respects limit and offset', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      for (let i = 0; i < 5; i++) {
        db.insert(activityLog).values({
          project_id: 'proj_test',
          user_id: 'usr_test_pm',
          action: 'capture_created',
          details: JSON.stringify({ i }),
          created_at: now + i,
        }).run()
      }

      const res = await request(app).get('/api/projects/proj_test/activity?limit=2&offset=1')
      expect(res.status).toBe(200)
      expect(res.body.activity).toHaveLength(2)
      expect(res.body.total).toBe(5)
    })
  })

  // ─── GET /metrics ──────────────────────────────────────────────────────────

  describe('GET /api/projects/:projectId/activity/metrics', () => {
    it('returns zero metrics when no data', async () => {
      const app = createTestApp(db)
      const res = await request(app).get('/api/projects/proj_test/activity/metrics')
      expect(res.status).toBe(200)
      expect(res.body.sessions.total).toBe(0)
      expect(res.body.captures.total).toBe(0)
      expect(res.body.epics.total).toBe(0)
      expect(res.body.prs.open).toBe(0)
      expect(res.body.prs.merged).toBe(0)
    })

    it('returns correct session metrics with success rate', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      db.insert(sessions).values([
        { id: 's1', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', started_at: now - 3600, finished_at: now, created_at: now },
        { id: 's2', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', started_at: now - 7200, finished_at: now, created_at: now },
        { id: 's3', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'failed', prompt: 'test', created_at: now },
        { id: 's4', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'running', prompt: 'test', created_at: now },
      ]).run()

      const res = await request(app).get('/api/projects/proj_test/activity/metrics')
      expect(res.status).toBe(200)
      expect(res.body.sessions.total).toBe(4)
      expect(res.body.sessions.completed).toBe(2)
      expect(res.body.sessions.failed).toBe(1)
      expect(res.body.sessions.running).toBe(1)
      expect(res.body.sessions.successRate).toBe(67) // 2/(2+1) = 66.7% rounded
    })

    it('returns correct capture metrics by status', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      db.insert(captures).values([
        { id: 'c1', project_id: 'proj_test', user_id: 'usr_test_pm', text: 'idea 1', status: 'pending', created_at: now },
        { id: 'c2', project_id: 'proj_test', user_id: 'usr_test_pm', text: 'idea 2', status: 'pending', created_at: now },
        { id: 'c3', project_id: 'proj_test', user_id: 'usr_test_pm', text: 'idea 3', status: 'triaged', created_at: now },
        { id: 'c4', project_id: 'proj_test', user_id: 'usr_test_pm', text: 'idea 4', status: 'deferred', created_at: now },
      ]).run()

      const res = await request(app).get('/api/projects/proj_test/activity/metrics')
      expect(res.status).toBe(200)
      expect(res.body.captures.total).toBe(4)
      expect(res.body.captures.pending).toBe(2)
      expect(res.body.captures.triaged).toBe(1)
      expect(res.body.captures.deferred).toBe(1)
    })

    it('returns correct epic metrics by status', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      db.insert(epics).values([
        { id: 'e1', project_id: 'proj_test', ui_status: 'ready', created_at: now, updated_at: now },
        { id: 'e2', project_id: 'proj_test', ui_status: 'in_progress', created_at: now, updated_at: now },
        { id: 'e3', project_id: 'proj_test', ui_status: 'done', created_at: now, updated_at: now },
        { id: 'e4', project_id: 'proj_test', ui_status: 'blocked', created_at: now, updated_at: now },
      ]).run()

      const res = await request(app).get('/api/projects/proj_test/activity/metrics')
      expect(res.status).toBe(200)
      expect(res.body.epics.total).toBe(4)
      expect(res.body.epics.byStatus.ready).toBe(1)
      expect(res.body.epics.byStatus.in_progress).toBe(1)
      expect(res.body.epics.byStatus.done).toBe(1)
      expect(res.body.epics.byStatus.blocked).toBe(1)
    })

    it('returns correct PR metrics', async () => {
      const app = createTestApp(db)
      const now = Math.floor(Date.now() / 1000)

      db.insert(sessions).values([
        { id: 's1', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', pr_url: 'https://github.com/test/1', pr_status: 'pending_review', created_at: now },
        { id: 's2', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', pr_url: 'https://github.com/test/2', pr_status: 'merged', created_at: now },
        { id: 's3', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', pr_url: 'https://github.com/test/3', pr_status: 'approved', created_at: now },
        { id: 's4', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', created_at: now }, // no PR
      ]).run()

      const res = await request(app).get('/api/projects/proj_test/activity/metrics')
      expect(res.status).toBe(200)
      expect(res.body.prs.open).toBe(2) // pending_review + approved
      expect(res.body.prs.merged).toBe(1)
    })
  })
})
