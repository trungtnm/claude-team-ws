import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createCapturesRouter } from './captures.js'

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

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'mock12345678'),
}))

import { emitToProject } from '../services/socket-manager.js'
import { authenticate } from '../middleware/auth.js'

describe('Captures Routes', () => {
  const mockGet = vi.fn()
  const mockAll = vi.fn()
  const mockRun = vi.fn()

  // Chainable query builder mock
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

  const mockBeadsService = {
    create: vi.fn().mockResolvedValue({ id: 'bead_123' }),
  } as any

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

    const router = createCapturesRouter({ db: mockDb, beadsService: mockBeadsService })
    app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use('/api/projects/:projectId/captures', router)
  })

  describe('GET /api/projects/:projectId/captures', () => {
    it('returns captures list', async () => {
      const captures = [
        { id: 'cap_1', text: 'Idea 1', status: 'pending' },
        { id: 'cap_2', text: 'Idea 2', status: 'triaged' },
      ]
      mockAll.mockReturnValue(captures)

      const res = await request(app).get('/api/projects/proj_1/captures')

      expect(res.status).toBe(200)
      expect(res.body.captures).toEqual(captures)
    })

    it('applies default limit of 50', async () => {
      mockAll.mockReturnValue([])

      await request(app).get('/api/projects/proj_1/captures')

      expect(selectChain.limit).toHaveBeenCalledWith(50)
    })

    it('caps limit at 200', async () => {
      mockAll.mockReturnValue([])

      await request(app).get('/api/projects/proj_1/captures?limit=500')

      expect(selectChain.limit).toHaveBeenCalledWith(200)
    })

    it('applies offset from query param', async () => {
      mockAll.mockReturnValue([])

      await request(app).get('/api/projects/proj_1/captures?offset=20')

      expect(selectChain.offset).toHaveBeenCalledWith(20)
    })
  })

  describe('POST /api/projects/:projectId/captures', () => {
    it('creates a capture and returns 201', async () => {
      const newCapture = {
        id: 'cap_mock12345678',
        text: 'New idea',
        status: 'pending',
        project_id: 'proj_1',
      }
      mockGet.mockReturnValue(newCapture)

      const res = await request(app)
        .post('/api/projects/proj_1/captures')
        .send({ text: 'New idea' })

      expect(res.status).toBe(201)
      expect(res.body.capture).toEqual(newCapture)
      expect(mockDb.insert).toHaveBeenCalledTimes(2) // captures + activityLog
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/projects/proj_1/captures')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
      expect(res.body.issues).toBeDefined()
    })

    it('returns 400 when text is empty', async () => {
      const res = await request(app)
        .post('/api/projects/proj_1/captures')
        .send({ text: '' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })

    it('returns 400 when text exceeds 5000 chars', async () => {
      const res = await request(app)
        .post('/api/projects/proj_1/captures')
        .send({ text: 'x'.repeat(5001) })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })
  })

  describe('PATCH /api/projects/:projectId/captures/:captureId', () => {
    it('updates an existing capture', async () => {
      const existing = { id: 'cap_1', text: 'Old', status: 'pending', project_id: 'proj_1' }
      const updated = { ...existing, text: 'Updated' }

      // First get: find existing, Second get: return updated
      mockGet.mockReturnValueOnce(existing).mockReturnValueOnce(updated)

      const res = await request(app)
        .patch('/api/projects/proj_1/captures/cap_1')
        .send({ text: 'Updated' })

      expect(res.status).toBe(200)
      expect(res.body.capture).toEqual(updated)
    })

    it('returns 404 when capture not found', async () => {
      mockGet.mockReturnValue(undefined)

      const res = await request(app)
        .patch('/api/projects/proj_1/captures/cap_nonexistent')
        .send({ text: 'Update' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Capture not found')
    })

    it('creates a bead when triaging with triage_result', async () => {
      const existing = { id: 'cap_1', text: 'Idea', status: 'pending', project_id: 'proj_1' }
      const updated = { ...existing, status: 'triaged' }
      mockGet.mockReturnValueOnce(existing).mockReturnValueOnce(updated)

      await request(app)
        .patch('/api/projects/proj_1/captures/cap_1')
        .send({ status: 'triaged', triage_result: 'Create login page' })

      expect(mockBeadsService.create).toHaveBeenCalledWith({
        title: 'Create login page',
        type: 'task',
        priority: 2,
      })
    })

    it('returns 403 for dev role (not pm/techlead)', async () => {
      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'user_dev', name: 'Dev', role: 'dev' }
          next()
        },
      )

      const res = await request(app)
        .patch('/api/projects/proj_1/captures/cap_1')
        .send({ text: 'Update' })

      expect(res.status).toBe(403)
    })

    it('returns 400 for invalid status value', async () => {
      const res = await request(app)
        .patch('/api/projects/proj_1/captures/cap_1')
        .send({ status: 'invalid_status' })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })
  })

  describe('DELETE /api/projects/:projectId/captures/:captureId', () => {
    it('deletes a capture and returns 204', async () => {
      const existing = { id: 'cap_1', text: 'To delete', project_id: 'proj_1' }
      mockGet.mockReturnValue(existing)

      const res = await request(app).delete('/api/projects/proj_1/captures/cap_1')

      expect(res.status).toBe(204)
      expect(emitToProject).toHaveBeenCalledWith('proj_1', 'capture:deleted', { id: 'cap_1' })
    })

    it('returns 404 when capture not found', async () => {
      mockGet.mockReturnValue(undefined)

      const res = await request(app).delete('/api/projects/proj_1/captures/cap_nonexistent')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Capture not found')
    })

    it('returns 403 for dev role', async () => {
      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'user_dev', name: 'Dev', role: 'dev' }
          next()
        },
      )

      const res = await request(app).delete('/api/projects/proj_1/captures/cap_1')

      expect(res.status).toBe(403)
    })
  })
})
