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
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.offset = vi.fn(() => chain)
  chain.get = mockGet
  chain.all = mockAll
  chain.run = mockRun

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
      _insertValues: insertValues,
      _setMock: setMock,
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user_pm', name: 'PM', role: 'pm' }
    next()
  }),
  requireRole: vi.fn((...roles: string[]) => (_req: any, _res: any, next: any) => next()),
}))

vi.mock('../middleware/project-access.js', () => ({
  requireProjectMember: vi.fn((_req: any, _res: any, next: any) => next()),
}))

vi.mock('../services/socket-manager.js', () => ({
  emitToProject: vi.fn(),
  emitToSession: vi.fn(),
}))

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'sess_mock123'),
}))

import { db } from '../db/index.js'
import { emitToProject, emitToSession } from '../services/socket-manager.js'

const mockDb = db as any
const mockGet = mockDb._mockGet as ReturnType<typeof vi.fn>
const mockAll = mockDb._mockAll as ReturnType<typeof vi.fn>

import sessionsRouter from './sessions.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/sessions', sessionsRouter)
  return app
}

describe('Sessions Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/projects/:projectId/sessions', () => {
    it('returns sessions list', async () => {
      const sessions = [
        { id: 's1', status: 'running', prompt: 'Do work' },
        { id: 's2', status: 'completed', prompt: 'Done' },
      ]
      mockAll.mockReturnValue(sessions)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/sessions')

      expect(res.status).toBe(200)
      expect(res.body.sessions).toEqual(sessions)
    })

    it('applies default limit of 50', async () => {
      mockAll.mockReturnValue([])

      const app = createApp()
      await request(app).get('/api/projects/proj_1/sessions')

      expect(mockDb._chain.limit).toHaveBeenCalledWith(50)
    })
  })

  describe('POST /api/projects/:projectId/sessions', () => {
    it('creates a session and returns 201', async () => {
      // First call: find project for concurrency check
      // Second call: count running sessions
      // Third call: get created session
      const project = { id: 'proj_1', max_concurrent_agents: 3 }
      const newSession = { id: 'sess_mock123', status: 'queued', prompt: 'Build feature' }

      mockGet.mockReturnValueOnce(project).mockReturnValueOnce(newSession)
      mockAll.mockReturnValue([]) // no running sessions

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({ prompt: 'Build feature' })

      expect(res.status).toBe(201)
      expect(res.body.session).toEqual(newSession)
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 400 when prompt is missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Validation failed')
    })

    it('returns 400 when prompt is empty', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({ prompt: '' })

      expect(res.status).toBe(400)
    })

    it('returns 429 when concurrency limit reached', async () => {
      const project = { id: 'proj_1', max_concurrent_agents: 2 }
      mockGet.mockReturnValueOnce(project)
      mockAll.mockReturnValue([{ id: 's1' }, { id: 's2' }]) // 2 running = at limit

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({ prompt: 'Another task' })

      expect(res.status).toBe(429)
      expect(res.body.error).toContain('Concurrency limit reached')
    })

    it('returns 404 when project not found', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({ prompt: 'Task' })

      expect(res.status).toBe(404)
    })

    it('accepts optional model parameter', async () => {
      const project = { id: 'proj_1', max_concurrent_agents: 3 }
      const session = { id: 'sess_mock123', status: 'queued', model: 'opus' }

      mockGet.mockReturnValueOnce(project).mockReturnValueOnce(session)
      mockAll.mockReturnValue([])

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({ prompt: 'Task', model: 'opus' })

      expect(res.status).toBe(201)
    })

    it('rejects invalid model', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions')
        .send({ prompt: 'Task', model: 'gpt-4' })

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/projects/:projectId/sessions/:sessionId', () => {
    it('returns session detail', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'running' }
      mockGet.mockReturnValue(session)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/sessions/s1')

      expect(res.status).toBe(200)
      expect(res.body.session).toEqual(session)
    })

    it('returns 404 for nonexistent session', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/sessions/s_bad')

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/sessions/:sessionId/cancel', () => {
    it('cancels a running session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'running' }
      const cancelled = { ...session, status: 'cancelled' }
      mockGet.mockReturnValueOnce(session).mockReturnValueOnce(cancelled)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/cancel')

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('cancelled')
      expect(emitToProject).toHaveBeenCalled()
      expect(emitToSession).toHaveBeenCalledWith('s1', 'session:cancelled', { session_id: 's1' })
    })

    it('can cancel a queued session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'queued' }
      const cancelled = { ...session, status: 'cancelled' }
      mockGet.mockReturnValueOnce(session).mockReturnValueOnce(cancelled)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/cancel')

      expect(res.status).toBe(200)
    })

    it('can cancel a waiting_input session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'waiting_input' }
      const cancelled = { ...session, status: 'cancelled' }
      mockGet.mockReturnValueOnce(session).mockReturnValueOnce(cancelled)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/cancel')

      expect(res.status).toBe(200)
    })

    it('returns 400 for completed session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'completed' }
      mockGet.mockReturnValue(session)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/cancel')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Cannot cancel session')
    })

    it('returns 404 for nonexistent session', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s_bad/cancel')

      expect(res.status).toBe(404)
    })
  })

  describe('POST /api/projects/:projectId/sessions/:sessionId/resume', () => {
    it('resumes a failed session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'failed' }
      const resumed = { ...session, status: 'queued' }
      mockGet.mockReturnValueOnce(session).mockReturnValueOnce(resumed)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/resume')

      expect(res.status).toBe(200)
      expect(res.body.session.status).toBe('queued')
    })

    it('resumes a cancelled session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'cancelled' }
      const resumed = { ...session, status: 'queued' }
      mockGet.mockReturnValueOnce(session).mockReturnValueOnce(resumed)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/resume')

      expect(res.status).toBe(200)
    })

    it('returns 400 for running session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'running' }
      mockGet.mockReturnValue(session)

      const app = createApp()
      const res = await request(app).post('/api/projects/proj_1/sessions/s1/resume')

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('Cannot resume session')
    })
  })

  describe('POST /api/projects/:projectId/sessions/:sessionId/answer', () => {
    it('sends answer to waiting session', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'waiting_input' }
      mockGet.mockReturnValue(session)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions/s1/answer')
        .send({ answer: 'Yes, proceed' })

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('answer_sent')
      expect(emitToSession).toHaveBeenCalledWith('s1', 'session:answer', {
        session_id: 's1',
        answer: 'Yes, proceed',
      })
    })

    it('returns 400 when session is not waiting for input', async () => {
      const session = { id: 's1', project_id: 'proj_1', status: 'running' }
      mockGet.mockReturnValue(session)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions/s1/answer')
        .send({ answer: 'reply' })

      expect(res.status).toBe(400)
      expect(res.body.error).toContain('not waiting for input')
    })

    it('returns 400 when answer is empty', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions/s1/answer')
        .send({ answer: '' })

      expect(res.status).toBe(400)
    })

    it('returns 400 when answer is missing', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/sessions/s1/answer')
        .send({})

      expect(res.status).toBe(400)
    })
  })

  describe('GET /api/projects/:projectId/sessions/:sessionId/events', () => {
    it('returns parsed session events', async () => {
      const session = { id: 's1', project_id: 'proj_1' }
      mockGet.mockReturnValue(session)

      const rawEvents = [
        { id: 1, session_id: 's1', event_type: 'system', data: '{"type":"init"}', created_at: 1000 },
        { id: 2, session_id: 's1', event_type: 'assistant', data: '{"text":"hello"}', created_at: 1001 },
      ]
      mockAll.mockReturnValue(rawEvents)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/sessions/s1/events')

      expect(res.status).toBe(200)
      expect(res.body.events).toHaveLength(2)
      expect(res.body.events[0].data).toEqual({ type: 'init' })
      expect(res.body.events[1].data).toEqual({ text: 'hello' })
    })

    it('returns 404 when session not found', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/sessions/s_bad/events')

      expect(res.status).toBe(404)
    })
  })
})
