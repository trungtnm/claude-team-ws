import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock modules before imports
vi.mock('../db/index.js', () => {
  const mockGet = vi.fn()
  const mockAll = vi.fn()
  const mockRun = vi.fn()

  const chain: any = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.get = mockGet
  chain.all = mockAll

  const insertValues = vi.fn(() => ({ run: mockRun }))
  const setWhere = vi.fn(() => ({ run: mockRun }))
  const setMock = vi.fn(() => ({ where: setWhere }))

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: setMock })),
      _chain: chain,
      _mockGet: mockGet,
      _mockAll: mockAll,
      _mockRun: mockRun,
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user_pm', name: 'PM', role: 'pm' }
    next()
  }),
  requireRole: vi.fn((...roles: string[]) => (req: any, res: any, next: any) => {
    const user = req.user as { role: string } | undefined
    if (!user || !roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }),
}))

vi.mock('../services/socket-manager.js', () => ({
  emitToProject: vi.fn(),
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock12345678'),
}))

import { db } from '../db/index.js'
import { emitToProject } from '../services/socket-manager.js'
import { authenticate } from '../middleware/auth.js'

const mockDb = db as any
const mockGet = mockDb._mockGet as ReturnType<typeof vi.fn>
const mockAll = mockDb._mockAll as ReturnType<typeof vi.fn>

import projectsRouter from './projects.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects', projectsRouter)
  return app
}

describe('Projects Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
      (req: any, _res: any, next: any) => {
        req.user = { id: 'user_pm', name: 'PM', role: 'pm' }
        next()
      },
    )
  })

  describe('GET /api/projects', () => {
    it('returns projects list', async () => {
      const projects = [
        { id: 'proj_1', name: 'Project A', slug: 'project-a' },
      ]
      mockAll.mockReturnValue(projects)

      const app = createApp()
      const res = await request(app).get('/api/projects')

      expect(res.status).toBe(200)
      expect(res.body.projects).toEqual(projects)
    })

    it('returns empty array when user has no projects', async () => {
      mockAll.mockReturnValue([])

      const app = createApp()
      const res = await request(app).get('/api/projects')

      expect(res.status).toBe(200)
      expect(res.body.projects).toEqual([])
    })
  })

  describe('POST /api/projects', () => {
    it('creates a project and returns 201', async () => {
      // First get: check slug uniqueness (not found)
      // Second get: return created project
      const newProject = { id: 'proj_mock12345678', name: 'New', slug: 'new-project' }
      mockGet.mockReturnValueOnce(undefined).mockReturnValueOnce(newProject)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'New', slug: 'new-project', project_root: '/path/to/project' })

      expect(res.status).toBe(201)
      expect(res.body.project).toEqual(newProject)
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 409 when slug already exists', async () => {
      mockGet.mockReturnValue({ id: 'proj_existing', slug: 'taken' })

      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Dupe', slug: 'taken', project_root: '/path' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('Project slug already exists')
    })

    it('returns 400 when name is missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ slug: 'test', project_root: '/path' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when slug contains uppercase', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test', slug: 'Bad-Slug', project_root: '/path' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when slug contains spaces', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test', slug: 'bad slug', project_root: '/path' })

      expect(res.status).toBe(400)
    })

    it('returns 403 for viewer role', async () => {
      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'user_v', name: 'Viewer', role: 'viewer' }
          next()
        },
      )

      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test', slug: 'test', project_root: '/path' })

      expect(res.status).toBe(403)
    })

    it('returns 403 for dev role', async () => {
      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'user_d', name: 'Dev', role: 'dev' }
          next()
        },
      )

      const app = createApp()
      const res = await request(app)
        .post('/api/projects')
        .send({ name: 'Test', slug: 'test', project_root: '/path' })

      expect(res.status).toBe(403)
    })
  })

  describe('GET /api/projects/:projectId', () => {
    it('returns project detail for member', async () => {
      const project = { id: 'proj_1', name: 'My Project' }
      const membership = { project_id: 'proj_1', user_id: 'user_pm' }

      // First get: find project by ID
      // Second get: check membership
      mockGet.mockReturnValueOnce(project).mockReturnValueOnce(membership)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1')

      expect(res.status).toBe(200)
      expect(res.body.project).toEqual(project)
    })

    it('returns 404 for nonexistent project', async () => {
      // Not found by ID, not found by slug
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_bad')

      expect(res.status).toBe(404)
    })

    it('returns 403 for non-member', async () => {
      const project = { id: 'proj_1', name: 'My Project' }
      mockGet.mockReturnValueOnce(project).mockReturnValueOnce(undefined) // no membership

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1')

      expect(res.status).toBe(403)
      expect(res.body.error).toBe('Not a member of this project')
    })
  })

  describe('PATCH /api/projects/:projectId', () => {
    it('updates project settings', async () => {
      const project = { id: 'proj_1', name: 'Old Name' }
      const membership = { project_id: 'proj_1', user_id: 'user_pm' }
      const updated = { id: 'proj_1', name: 'New Name' }

      mockGet
        .mockReturnValueOnce(project) // find project
        .mockReturnValueOnce(membership) // check membership
        .mockReturnValueOnce(updated) // return updated

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1')
        .send({ name: 'New Name' })

      expect(res.status).toBe(200)
      expect(res.body.project).toEqual(updated)
    })

    it('returns 404 for nonexistent project', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_bad')
        .send({ name: 'Update' })

      expect(res.status).toBe(404)
    })

    it('validates max_concurrent_agents range', async () => {
      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1')
        .send({ max_concurrent_agents: 25 })

      expect(res.status).toBe(400)
    })

    it('validates ask_question_mode enum', async () => {
      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1')
        .send({ ask_question_mode: 'invalid' })

      expect(res.status).toBe(400)
    })
  })
})
