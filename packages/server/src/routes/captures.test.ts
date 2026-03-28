import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'

// Mock middleware
vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user_pm', name: 'PM User', role: 'pm' }
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

vi.mock('../utils/log-error.js', () => ({
  logError: vi.fn((_ctx: string, err: unknown) => String(err)),
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock12345678'),
}))

// Mock DB — chainable query builder
const mockGet = vi.fn()
const mockAll = vi.fn()
const mockRun = vi.fn()

const createChainMock = () => {
  const chain: any = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.offset = vi.fn(() => chain)
  chain.get = mockGet
  chain.all = mockAll
  chain.run = mockRun
  return chain
}

const selectChain = createChainMock()
const insertChain = { values: vi.fn(() => ({ run: mockRun })) }
const updateChain = { set: vi.fn(() => ({ where: vi.fn(() => ({ run: mockRun })) })) }
const deleteChain = { where: vi.fn(() => ({ run: mockRun })) }

const mockDb = {
  select: vi.fn(() => selectChain),
  insert: vi.fn(() => insertChain),
  update: vi.fn(() => updateChain),
  delete: vi.fn(() => deleteChain),
} as any

vi.mock('../db/index.js', () => ({
  db: mockDb,
}))

import { emitToProject } from '../services/socket-manager.js'
import { authenticate } from '../middleware/auth.js'

const capturesModule = await import('./captures.js')
const capturesRouter = capturesModule.default

describe('Captures Routes', () => {
  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()

    // Reset to PM user
    ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
      (req: any, _res: any, next: any) => {
        req.user = { id: 'user_pm', name: 'PM User', role: 'pm' }
        next()
      },
    )

    app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use('/api/projects/:projectId/captures', capturesRouter)
  })

  describe('GET /api/projects/:projectId/captures', () => {
    it('returns captures list', async () => {
      mockAll.mockReturnValueOnce([
        { id: 'cap_1', text: 'Test capture', status: 'pending' },
      ])

      const res = await request(app).get('/api/projects/proj1/captures')
      expect(res.status).toBe(200)
      expect(res.body.captures).toBeDefined()
    })

    it('applies default limit of 50', async () => {
      mockAll.mockReturnValueOnce([])
      await request(app).get('/api/projects/proj1/captures')
      expect(selectChain.limit).toHaveBeenCalledWith(50)
    })

    it('caps limit at 200', async () => {
      mockAll.mockReturnValueOnce([])
      await request(app).get('/api/projects/proj1/captures?limit=500')
      expect(selectChain.limit).toHaveBeenCalledWith(200)
    })

    it('applies offset from query param', async () => {
      mockAll.mockReturnValueOnce([])
      await request(app).get('/api/projects/proj1/captures?offset=10')
      expect(selectChain.offset).toHaveBeenCalledWith(10)
    })
  })

  describe('POST /api/projects/:projectId/captures', () => {
    it('creates a capture', async () => {
      mockGet.mockReturnValueOnce({ id: 'cap_mock12345678', text: 'My idea', status: 'pending' })

      const res = await request(app)
        .post('/api/projects/proj1/captures')
        .send({ text: 'My idea' })

      expect(res.status).toBe(201)
      expect(res.body.capture).toBeDefined()
      expect(emitToProject).toHaveBeenCalled()
    })

    it('validates text is required', async () => {
      const res = await request(app)
        .post('/api/projects/proj1/captures')
        .send({})

      expect(res.status).toBe(400)
    })

    it('validates text min length', async () => {
      const res = await request(app)
        .post('/api/projects/proj1/captures')
        .send({ text: '' })

      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/projects/:projectId/captures/:captureId', () => {
    it('updates capture status', async () => {
      mockGet.mockReturnValueOnce({ id: 'cap_1', project_id: 'proj1', status: 'pending' })
      mockGet.mockReturnValueOnce({ id: 'cap_1', status: 'triaged', triaged_at: 123, triaged_by: 'user_pm' })

      const res = await request(app)
        .patch('/api/projects/proj1/captures/cap_1')
        .send({ status: 'triaged' })

      expect(res.status).toBe(200)
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 404 for non-existent capture', async () => {
      mockGet.mockReturnValueOnce(undefined)

      const res = await request(app)
        .patch('/api/projects/proj1/captures/cap_missing')
        .send({ status: 'triaged' })

      expect(res.status).toBe(404)
    })

    it('rejects dev role for triage', async () => {
      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'user_dev', name: 'Dev User', role: 'dev' }
          next()
        },
      )

      const res = await request(app)
        .patch('/api/projects/proj1/captures/cap_1')
        .send({ status: 'triaged' })

      expect(res.status).toBe(403)
    })
  })

  describe('DELETE /api/projects/:projectId/captures/:captureId', () => {
    it('deletes a capture', async () => {
      mockGet.mockReturnValueOnce({ id: 'cap_1', project_id: 'proj1' })

      const res = await request(app)
        .delete('/api/projects/proj1/captures/cap_1')

      expect(res.status).toBe(204)
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 404 for non-existent capture', async () => {
      mockGet.mockReturnValueOnce(undefined)

      const res = await request(app)
        .delete('/api/projects/proj1/captures/cap_missing')

      expect(res.status).toBe(404)
    })
  })
})
