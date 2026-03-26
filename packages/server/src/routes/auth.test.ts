import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import cookieParser from 'cookie-parser'
import { createAuthRouter } from './auth.js'

// Mock the auth middleware
vi.mock('../middleware/auth.js', () => ({
  getJwtSecret: vi.fn(() => 'test-secret-key-for-testing'),
  authenticate: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: 'user_test123', name: 'Test User', role: 'pm' }
    next()
  }),
}))

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  default: {
    sign: vi.fn(() => 'mock-jwt-token'),
    verify: vi.fn(() => ({ userId: 'user_test123' })),
  },
}))

describe('Auth Routes', () => {
  // Mock db with chainable query builder
  const mockGet = vi.fn()
  const mockRun = vi.fn()
  const mockWhere = vi.fn(() => ({ get: mockGet }))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))

  const mockDb = {
    select: mockSelect,
  } as any

  const mockUsers = {
    api_key: 'api_key',
    id: 'id',
  } as any

  let app: express.Express

  beforeEach(() => {
    vi.clearAllMocks()

    const router = createAuthRouter({ db: mockDb, users: mockUsers })
    app = express()
    app.use(express.json())
    app.use(cookieParser())
    app.use('/api/auth', router)
  })

  describe('POST /api/auth/login', () => {
    it('returns 400 when api_key is missing', async () => {
      const res = await request(app).post('/api/auth/login').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('API key is required')
    })

    it('returns 400 when api_key is not a string', async () => {
      const res = await request(app).post('/api/auth/login').send({ api_key: 123 })

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('API key is required')
    })

    it('returns 401 for invalid api key', async () => {
      mockGet.mockReturnValue(undefined)

      const res = await request(app).post('/api/auth/login').send({ api_key: 'bad-key' })

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('Invalid API key')
    })

    it('returns user and sets cookie on valid login', async () => {
      const user = {
        id: 'user_abc',
        name: 'Alice',
        email: 'alice@example.com',
        role: 'pm',
        avatar_url: null,
        created_at: 1000,
        updated_at: 1000,
      }
      mockGet.mockReturnValue(user)

      const res = await request(app).post('/api/auth/login').send({ api_key: 'valid-key' })

      expect(res.status).toBe(200)
      expect(res.body.user).toEqual(user)
      expect(res.headers['set-cookie']).toBeDefined()
      expect(res.headers['set-cookie'][0]).toContain('ctw_session')
    })
  })

  describe('GET /api/auth/me', () => {
    it('returns current user', async () => {
      const fullUser = {
        id: 'user_test123',
        name: 'Test User',
        email: 'test@example.com',
        role: 'pm',
        avatar_url: null,
        created_at: 1000,
        updated_at: 1000,
      }
      mockGet.mockReturnValue(fullUser)

      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(200)
      expect(res.body.user).toEqual(fullUser)
    })

    it('returns 401 when user not found in DB', async () => {
      mockGet.mockReturnValue(undefined)

      const res = await request(app).get('/api/auth/me')

      expect(res.status).toBe(401)
      expect(res.body.error).toBe('User not found')
    })
  })

  describe('POST /api/auth/logout', () => {
    it('clears the session cookie and returns 204', async () => {
      const res = await request(app).post('/api/auth/logout')

      expect(res.status).toBe(204)
      expect(res.headers['set-cookie']).toBeDefined()
      // Cookie should be cleared (expired)
      expect(res.headers['set-cookie'][0]).toContain('ctw_session=')
    })
  })
})
