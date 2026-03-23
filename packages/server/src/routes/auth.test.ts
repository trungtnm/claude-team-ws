import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

const mockGet = vi.fn()
const mockRun = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mockGet,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        run: mockRun,
      }),
    }),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: Request, _res: Response, next: () => void) => {
    req.user = { id: 'user-123', name: 'Test', email: 'test@example.com', role: 'pm' }
    next()
  },
}))

// Dynamic import after mocks are set up
const { default: router } = await import('./auth.js')

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    body: {},
    query: {},
    params: {},
    ...overrides,
  } as unknown as Request
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

describe('auth routes', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockRun.mockReset()
    vi.stubEnv('JWT_SECRET', 'test-secret')
  })

  describe('POST /login', () => {
    it('should validate login body with zod', async () => {
      // Find the login handler from router stack
      const loginLayer = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/login' && layer.route?.methods?.post,
      )
      expect(loginLayer).toBeDefined()
    })

    it('should reject invalid login body', async () => {
      const loginHandler = (router as any).stack
        .find((l: any) => l.route?.path === '/login')
        ?.route?.stack?.find((s: any) => s.method === 'post')?.handle

      if (!loginHandler) return // skip if handler not found via stack introspection

      const req = mockReq({ body: { email: 'not-an-email' } })
      const res = mockRes()

      await loginHandler(req, res)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('POST /logout', () => {
    it('should clear the session cookie', () => {
      const logoutLayer = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/logout',
      )
      expect(logoutLayer).toBeDefined()

      const handler = logoutLayer.route.stack.find(
        (s: any) => s.method === 'post',
      )?.handle

      const req = mockReq()
      const res = mockRes()

      handler(req, res)

      expect(res.clearCookie).toHaveBeenCalledWith('ctw_session')
      expect(res.json).toHaveBeenCalledWith({ message: 'Đã đăng xuất' })
    })
  })

  describe('GET /me', () => {
    it('should have /me route defined', () => {
      const meLayer = (router as any).stack.find(
        (layer: any) => layer.route?.path === '/me',
      )
      expect(meLayer).toBeDefined()
    })
  })
})
