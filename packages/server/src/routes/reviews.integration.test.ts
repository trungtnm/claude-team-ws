import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import express from 'express'
import request from 'supertest'
import { createTestDb, seedTestData } from '../db/test-db.js'
import { sessions, activityLog } from '../db/schema.js'

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

const mockGetPr = vi.fn()
const mockGetPrDiff = vi.fn()
const mockAddPrComment = vi.fn()
const mockMergePr = vi.fn()

vi.mock('../services/gh-service.js', () => ({
  GhService: vi.fn().mockImplementation(() => ({
    getPr: mockGetPr,
    getPrDiff: mockGetPrDiff,
    addPrComment: mockAddPrComment,
    mergePr: mockMergePr,
  })),
}))

vi.mock('../db/index.js', () => ({
  db: testDb,
}))

const reviewsModule = await import('./reviews.js')
const reviewsRouter = reviewsModule.default

// ─── Test setup ──────────────────────────────────────────────────────────────

function createTestApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/reviews', reviewsRouter)
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
  vi.clearAllMocks()
  testDb.delete(activityLog).run()
  testDb.delete(sessions).run()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Reviews route (integration)', () => {
  describe('GET /api/projects/:projectId/reviews', () => {
    it('returns empty list when no sessions with PRs', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/reviews')
      expect(res.status).toBe(200)
      expect(res.body.reviews).toEqual([])
    })

    it('returns only sessions with pr_url', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)

      testDb.insert(sessions).values([
        { id: 's1', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', pr_url: 'https://github.com/test/1', pr_status: 'pending_review', created_at: now },
        { id: 's2', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', created_at: now }, // no PR
        { id: 's3', project_id: 'proj_test', user_id: 'usr_test_pm', status: 'completed', prompt: 'test', pr_url: 'https://github.com/test/3', pr_status: 'merged', created_at: now },
      ]).run()

      const res = await request(app).get('/api/projects/proj_test/reviews')
      expect(res.status).toBe(200)
      expect(res.body.reviews).toHaveLength(2)
      expect(res.body.reviews.every((r: any) => r.pr_url)).toBe(true)
    })
  })

  describe('GET /api/projects/:projectId/reviews/:sessionId', () => {
    it('returns review detail with PR data', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)

      testDb.insert(sessions).values({
        id: 'sess_pr', project_id: 'proj_test', user_id: 'usr_test_pm',
        status: 'completed', prompt: 'test',
        pr_url: 'https://github.com/test/repo/pull/1',
        pr_status: 'pending_review', created_at: now,
      }).run()

      mockGetPr.mockResolvedValue({ title: 'Fix bug', state: 'open', number: 1 })
      mockGetPrDiff.mockResolvedValue('diff --git a/file.ts b/file.ts\n+added')

      const res = await request(app).get('/api/projects/proj_test/reviews/sess_pr')
      expect(res.status).toBe(200)
      expect(res.body.review.session.id).toBe('sess_pr')
      expect(res.body.review.pr.title).toBe('Fix bug')
      expect(res.body.review.diff).toContain('+added')
    })

    it('returns 404 for non-existent session', async () => {
      const app = createTestApp()
      const res = await request(app).get('/api/projects/proj_test/reviews/nonexistent')
      expect(res.status).toBe(404)
    })

    it('returns 404 for session without PR', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)

      testDb.insert(sessions).values({
        id: 'sess_nopr', project_id: 'proj_test', user_id: 'usr_test_pm',
        status: 'completed', prompt: 'test', created_at: now,
      }).run()

      const res = await request(app).get('/api/projects/proj_test/reviews/sess_nopr')
      expect(res.status).toBe(404)
      expect(res.body.error).toContain('no associated PR')
    })
  })

  describe('POST /api/projects/:projectId/reviews/:sessionId/comment', () => {
    it('adds a PR comment', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)

      testDb.insert(sessions).values({
        id: 'sess_comment', project_id: 'proj_test', user_id: 'usr_test_pm',
        status: 'completed', prompt: 'test',
        pr_url: 'https://github.com/test/repo/pull/1',
        created_at: now,
      }).run()

      mockAddPrComment.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/projects/proj_test/reviews/sess_comment/comment')
        .send({ body: 'Looks good!' })

      expect(res.status).toBe(201)
      expect(res.body.status).toBe('comment_added')
      expect(mockAddPrComment).toHaveBeenCalledWith(
        'https://github.com/test/repo/pull/1',
        'Looks good!',
      )
    })

    it('returns 400 for session without PR', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)

      testDb.insert(sessions).values({
        id: 'sess_nopr2', project_id: 'proj_test', user_id: 'usr_test_pm',
        status: 'completed', prompt: 'test', created_at: now,
      }).run()

      const res = await request(app)
        .post('/api/projects/proj_test/reviews/sess_nopr2/comment')
        .send({ body: 'Should fail' })

      expect(res.status).toBe(400)
    })

    it('returns 400 for empty comment body', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/reviews/sess_1/comment')
        .send({})
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/projects/:projectId/reviews/:sessionId/merge', () => {
    it('merges a PR with squash strategy', async () => {
      const app = createTestApp()
      const now = Math.floor(Date.now() / 1000)

      testDb.insert(sessions).values({
        id: 'sess_merge', project_id: 'proj_test', user_id: 'usr_test_pm',
        status: 'completed', prompt: 'test',
        pr_url: 'https://github.com/test/repo/pull/1',
        pr_status: 'approved', created_at: now,
      }).run()

      mockMergePr.mockResolvedValue(undefined)

      const res = await request(app)
        .post('/api/projects/proj_test/reviews/sess_merge/merge')
        .send({ strategy: 'squash' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('merged')
      expect(mockMergePr).toHaveBeenCalledWith(
        'https://github.com/test/repo/pull/1',
        'squash',
      )

      // Check session pr_status updated
      const session = testDb.select().from(sessions).all()[0]
      expect(session.pr_status).toBe('merged')

      // Check activity logged
      const activity = testDb.select().from(activityLog).all()
      expect(activity).toHaveLength(1)
      expect(activity[0].action).toBe('pr_merged')
    })

    it('rejects dev role (403)', async () => {
      currentUser = TEST_DEV
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/reviews/sess_1/merge')
        .send({})
      expect(res.status).toBe(403)
    })

    it('returns 404 for non-existent session', async () => {
      const app = createTestApp()
      const res = await request(app)
        .post('/api/projects/proj_test/reviews/nonexistent/merge')
        .send({})
      expect(res.status).toBe(404)
    })
  })
})
