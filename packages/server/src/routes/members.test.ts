import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../db/index.js', () => {
  const mockGet = vi.fn()
  const mockAll = vi.fn()
  const mockRun = vi.fn()

  const chain: any = {}
  chain.from = vi.fn(() => chain)
  chain.innerJoin = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.get = mockGet
  chain.all = mockAll

  const insertValues = vi.fn(() => ({ run: mockRun }))
  const setWhere = vi.fn(() => ({ run: mockRun }))
  const setMock = vi.fn(() => ({ where: setWhere }))
  const deleteWhere = vi.fn(() => ({ run: mockRun }))

  return {
    db: {
      select: vi.fn(() => chain),
      insert: vi.fn(() => ({ values: insertValues })),
      update: vi.fn(() => ({ set: setMock })),
      delete: vi.fn(() => ({ where: deleteWhere })),
      _chain: chain,
      _mockGet: mockGet,
      _mockAll: mockAll,
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

vi.mock('../middleware/project-access.js', () => ({
  requireProjectMember: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../services/socket-manager.js', () => ({
  emitToProject: vi.fn(),
}))

import { db } from '../db/index.js'
import { emitToProject } from '../services/socket-manager.js'
import { authenticate } from '../middleware/auth.js'

const mockDb = db as any
const mockGet = mockDb._mockGet as ReturnType<typeof vi.fn>
const mockAll = mockDb._mockAll as ReturnType<typeof vi.fn>

import membersRouter from './members.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/members', membersRouter)
  return app
}

describe('Members Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
      (req: any, _res: any, next: any) => {
        req.user = { id: 'user_pm', name: 'PM', role: 'pm' }
        next()
      },
    )
  })

  describe('GET /api/projects/:projectId/members', () => {
    it('returns members list with user info', async () => {
      const members = [
        { user_id: 'u1', role_override: null, name: 'Alice', email: 'a@x.com', role: 'pm' },
        { user_id: 'u2', role_override: 'dev', name: 'Bob', email: 'b@x.com', role: 'techlead' },
      ]
      mockAll.mockReturnValue(members)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/members')

      expect(res.status).toBe(200)
      expect(res.body.members).toEqual(members)
      expect(res.body.members).toHaveLength(2)
    })
  })

  describe('POST /api/projects/:projectId/members', () => {
    it('adds a new member and returns 201', async () => {
      const user = { id: 'u_new', name: 'New User', email: 'new@x.com', role: 'dev', avatar_url: null }

      // First get: user exists
      // Second get: not already a member
      mockGet.mockReturnValueOnce(user).mockReturnValueOnce(undefined)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/members')
        .send({ user_id: 'u_new' })

      expect(res.status).toBe(201)
      expect(res.body.member.user_id).toBe('u_new')
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 404 when user does not exist', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/members')
        .send({ user_id: 'u_ghost' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('User not found')
    })

    it('returns 409 when user is already a member', async () => {
      const user = { id: 'u_dup', name: 'Dup' }
      const membership = { project_id: 'proj_1', user_id: 'u_dup' }

      mockGet.mockReturnValueOnce(user).mockReturnValueOnce(membership)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/members')
        .send({ user_id: 'u_dup' })

      expect(res.status).toBe(409)
      expect(res.body.error).toBe('User is already a member of this project')
    })

    it('returns 400 when user_id is missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/members')
        .send({})

      expect(res.status).toBe(400)
    })

    it('returns 403 for dev role', async () => {
      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'user_dev', name: 'Dev', role: 'dev' }
          next()
        },
      )

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/members')
        .send({ user_id: 'u_new' })

      expect(res.status).toBe(403)
    })
  })

  describe('PATCH /api/projects/:projectId/members/:userId', () => {
    it('updates member role override', async () => {
      const existing = { project_id: 'proj_1', user_id: 'u1', role_override: null }
      mockGet.mockReturnValue(existing)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/members/u1')
        .send({ role_override: 'techlead' })

      expect(res.status).toBe(200)
      expect(res.body.member.role_override).toBe('techlead')
      expect(emitToProject).toHaveBeenCalled()
    })

    it('can set role_override to null', async () => {
      const existing = { project_id: 'proj_1', user_id: 'u1', role_override: 'dev' }
      mockGet.mockReturnValue(existing)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/members/u1')
        .send({ role_override: null })

      expect(res.status).toBe(200)
      expect(res.body.member.role_override).toBeNull()
    })

    it('returns 404 when member not found', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/members/u_bad')
        .send({ role_override: 'dev' })

      expect(res.status).toBe(404)
    })

    it('returns 400 for invalid role', async () => {
      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/members/u1')
        .send({ role_override: 'admin' })

      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/projects/:projectId/members/:userId', () => {
    it('removes a member and returns 204', async () => {
      const existing = { project_id: 'proj_1', user_id: 'u1' }
      mockGet.mockReturnValue(existing)

      const app = createApp()
      const res = await request(app).delete('/api/projects/proj_1/members/u1')

      expect(res.status).toBe(204)
      expect(emitToProject).toHaveBeenCalledWith('proj_1', 'member:removed', { user_id: 'u1' })
    })

    it('returns 404 when member not found', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).delete('/api/projects/proj_1/members/u_bad')

      expect(res.status).toBe(404)
    })
  })
})
