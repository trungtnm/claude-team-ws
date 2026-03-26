import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

// Mock modules
vi.mock('../db/index.js', () => {
  const mockGet = vi.fn()
  const mockAll = vi.fn()
  const mockRun = vi.fn()

  const chain: any = {}
  chain.from = vi.fn(() => chain)
  chain.where = vi.fn(() => chain)
  chain.orderBy = vi.fn(() => chain)
  chain.limit = vi.fn(() => chain)
  chain.get = mockGet
  chain.all = mockAll
  chain.run = mockRun

  const setChain: any = {}
  setChain.where = vi.fn(() => ({ run: mockRun }))

  return {
    db: {
      select: vi.fn(() => chain),
      update: vi.fn(() => ({ set: vi.fn(() => setChain) })),
      _chain: chain,
      _mockGet: mockGet,
      _mockAll: mockAll,
      _mockRun: mockRun,
    },
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user_1', name: 'Test', role: 'pm' }
    next()
  }),
  requireRole: vi.fn((...roles: string[]) => (_req: any, _res: any, next: any) => next()),
}))

vi.mock('../services/socket-manager.js', () => ({
  emitToUser: vi.fn(),
}))

import { db } from '../db/index.js'
import { emitToUser } from '../services/socket-manager.js'

// Access internal mock helpers
const mockDb = db as any
const mockGet = mockDb._mockGet as ReturnType<typeof vi.fn>
const mockAll = mockDb._mockAll as ReturnType<typeof vi.fn>

// Must import after mocks
import notificationsRouter from './notifications.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/notifications', notificationsRouter)
  return app
}

describe('Notifications Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/notifications', () => {
    it('returns notifications with boolean read field', async () => {
      mockAll.mockReturnValue([
        { id: 'n1', user_id: 'user_1', title: 'Test', read: 0, created_at: 1000 },
        { id: 'n2', user_id: 'user_1', title: 'Read', read: 1, created_at: 999 },
      ])

      const app = createApp()
      const res = await request(app).get('/api/notifications')

      expect(res.status).toBe(200)
      expect(res.body.notifications).toHaveLength(2)
      expect(res.body.notifications[0].read).toBe(false)
      expect(res.body.notifications[1].read).toBe(true)
    })

    it('filters by read=false', async () => {
      mockAll.mockReturnValue([
        { id: 'n1', user_id: 'user_1', title: 'Unread', read: 0, created_at: 1000 },
        { id: 'n2', user_id: 'user_1', title: 'Read', read: 1, created_at: 999 },
      ])

      const app = createApp()
      const res = await request(app).get('/api/notifications?read=false')

      expect(res.status).toBe(200)
      // Filter is done in-memory: only read=0 items should remain
      expect(res.body.notifications).toHaveLength(1)
      expect(res.body.notifications[0].id).toBe('n1')
    })

    it('filters by read=true', async () => {
      mockAll.mockReturnValue([
        { id: 'n1', user_id: 'user_1', title: 'Unread', read: 0, created_at: 1000 },
        { id: 'n2', user_id: 'user_1', title: 'Read', read: 1, created_at: 999 },
      ])

      const app = createApp()
      const res = await request(app).get('/api/notifications?read=true')

      expect(res.status).toBe(200)
      expect(res.body.notifications).toHaveLength(1)
      expect(res.body.notifications[0].id).toBe('n2')
    })

    it('respects limit parameter', async () => {
      mockAll.mockReturnValue([])

      const app = createApp()
      await request(app).get('/api/notifications?limit=10')

      // Verify limit was applied to chain
      expect(mockDb._chain.limit).toHaveBeenCalledWith(10)
    })

    it('caps limit at 200', async () => {
      mockAll.mockReturnValue([])

      const app = createApp()
      await request(app).get('/api/notifications?limit=999')

      expect(mockDb._chain.limit).toHaveBeenCalledWith(200)
    })
  })

  describe('PATCH /api/notifications/:notificationId', () => {
    it('marks notification as read', async () => {
      const notification = { id: 'n1', user_id: 'user_1', title: 'Test', read: 0 }
      mockGet.mockReturnValue(notification)

      const app = createApp()
      const res = await request(app).patch('/api/notifications/n1')

      expect(res.status).toBe(200)
      expect(res.body.notification.read).toBe(true)
      expect(emitToUser).toHaveBeenCalledWith('user_1', 'notification:read', { id: 'n1' })
    })

    it('returns 404 when notification not found', async () => {
      mockGet.mockReturnValue(undefined)

      const app = createApp()
      const res = await request(app).patch('/api/notifications/n_bad')

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Notification not found')
    })
  })

  describe('POST /api/notifications/mark-all-read', () => {
    it('marks all notifications as read', async () => {
      const app = createApp()
      const res = await request(app).post('/api/notifications/mark-all-read')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(emitToUser).toHaveBeenCalledWith('user_1', 'notification:all-read', {})
    })
  })
})
