import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../db/index.js', () => {
  const mockGet = vi.fn()
  const mockAll = vi.fn()
  const mockRun = vi.fn()

  const chain: any = {}
  chain.from = vi.fn(() => chain)
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

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'whmock123456'),
}))

import { db } from '../db/index.js'
import { emitToProject } from '../services/socket-manager.js'
import { authenticate } from '../middleware/auth.js'

const mockDb = db as any
const mockGet = mockDb._mockGet as ReturnType<typeof vi.fn>
const mockAll = mockDb._mockAll as ReturnType<typeof vi.fn>

import webhooksRouter from './webhooks.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/projects/:projectId/webhooks', webhooksRouter)
  return app
}

describe('Webhooks Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
      (req: any, _res: any, next: any) => {
        req.user = { id: 'user_pm', name: 'PM', role: 'pm' }
        next()
      },
    )
  })

  describe('GET /api/projects/:projectId/webhooks', () => {
    it('returns webhooks with parsed events and boolean enabled', async () => {
      mockAll.mockReturnValue([
        {
          id: 'wh_1',
          project_id: 'proj_1',
          type: 'slack',
          url: 'https://hooks.slack.com/x',
          events: '["session_complete","pr_ready"]',
          enabled: 1,
          created_at: 1000,
        },
      ])

      const app = createApp()
      const res = await request(app).get('/api/projects/proj_1/webhooks')

      expect(res.status).toBe(200)
      expect(res.body.webhooks).toHaveLength(1)
      expect(res.body.webhooks[0].events).toEqual(['session_complete', 'pr_ready'])
      expect(res.body.webhooks[0].enabled).toBe(true)
    })
  })

  describe('POST /api/projects/:projectId/webhooks', () => {
    it('creates a Slack webhook and returns 201', async () => {
      const webhook = {
        id: 'wh_whmock123456',
        project_id: 'proj_1',
        type: 'slack',
        url: 'https://hooks.slack.com/services/T/B/x',
        events: '["session_complete","pr_ready","pr_merged"]',
        enabled: 1,
        created_at: 1000,
      }
      mockGet.mockReturnValue(webhook)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/webhooks')
        .send({
          type: 'slack',
          url: 'https://hooks.slack.com/services/T/B/x',
        })

      expect(res.status).toBe(201)
      expect(res.body.webhook.type).toBe('slack')
      expect(res.body.webhook.enabled).toBe(true)
      expect(res.body.webhook.events).toEqual(['session_complete', 'pr_ready', 'pr_merged'])
    })

    it('creates a Discord webhook', async () => {
      const webhook = {
        id: 'wh_1',
        type: 'discord',
        url: 'https://discord.com/api/webhooks/123/abc',
        events: '["pr_merged"]',
        enabled: 1,
        created_at: 1000,
      }
      mockGet.mockReturnValue(webhook)

      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/webhooks')
        .send({
          type: 'discord',
          url: 'https://discord.com/api/webhooks/123/abc',
          events: ['pr_merged'],
        })

      expect(res.status).toBe(201)
    })

    it('rejects non-HTTPS URL', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/webhooks')
        .send({
          type: 'slack',
          url: 'http://hooks.slack.com/services/T/B/x',
        })

      expect(res.status).toBe(400)
    })

    it('rejects non-whitelisted host', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/webhooks')
        .send({
          type: 'slack',
          url: 'https://evil.com/webhook',
        })

      expect(res.status).toBe(400)
    })

    it('rejects invalid type', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/webhooks')
        .send({
          type: 'teams',
          url: 'https://hooks.slack.com/x',
        })

      expect(res.status).toBe(400)
    })

    it('rejects invalid event names', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/projects/proj_1/webhooks')
        .send({
          type: 'slack',
          url: 'https://hooks.slack.com/x',
          events: ['invalid_event'],
        })

      expect(res.status).toBe(400)
    })
  })

  describe('PATCH /api/projects/:projectId/webhooks/:webhookId', () => {
    it('updates webhook URL', async () => {
      const existing = {
        id: 'wh_1',
        project_id: 'proj_1',
        type: 'slack',
        url: 'https://hooks.slack.com/old',
        events: '["session_complete"]',
        enabled: 1,
      }
      const updated = { ...existing, url: 'https://hooks.slack.com/new' }

      mockGet.mockReturnValueOnce(existing).mockReturnValueOnce(updated)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/webhooks/wh_1')
        .send({ url: 'https://hooks.slack.com/new' })

      expect(res.status).toBe(200)
      expect(emitToProject).toHaveBeenCalled()
    })

    it('returns 404 for nonexistent webhook', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/webhooks/wh_bad')
        .send({ enabled: false })

      expect(res.status).toBe(404)
    })

    it('returns 400 when no fields to update', async () => {
      const existing = { id: 'wh_1', project_id: 'proj_1' }
      mockGet.mockReturnValue(existing)

      const app = createApp()
      const res = await request(app)
        .patch('/api/projects/proj_1/webhooks/wh_1')
        .send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('No fields to update')
    })
  })

  describe('DELETE /api/projects/:projectId/webhooks/:webhookId', () => {
    it('deletes webhook and returns 204', async () => {
      const existing = { id: 'wh_1', project_id: 'proj_1' }
      mockGet.mockReturnValue(existing)

      const app = createApp()
      const res = await request(app).delete('/api/projects/proj_1/webhooks/wh_1')

      expect(res.status).toBe(204)
      expect(emitToProject).toHaveBeenCalledWith('proj_1', 'webhook:deleted', { id: 'wh_1' })
    })

    it('returns 404 for nonexistent webhook', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).delete('/api/projects/proj_1/webhooks/wh_bad')

      expect(res.status).toBe(404)
    })
  })
})
