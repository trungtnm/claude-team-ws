import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'

// Mock jsonwebtoken
const { mockSign, mockVerify } = vi.hoisted(() => ({
  mockSign: vi.fn(),
  mockVerify: vi.fn(),
}))

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: mockSign,
    verify: mockVerify,
  },
}))

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: () => 'mock-random-secret-hex',
  })),
}))

import { authenticate, requireRole, setAuthUserLookup, getJwtSecret } from './auth.js'

function createMockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    user: undefined,
    ...overrides,
  } as unknown as Request
}

function createMockRes(): Response & { _status: number; _json: unknown } {
  const res: any = {
    _status: 200,
    _json: null,
    status(code: number) {
      res._status = code
      return res
    },
    json(data: unknown) {
      res._json = data
      return res
    },
  }
  return res
}

describe('Auth Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getJwtSecret', () => {
    it('returns a string', () => {
      const secret = getJwtSecret()
      expect(typeof secret).toBe('string')
      expect(secret.length).toBeGreaterThan(0)
    })
  })

  describe('authenticate', () => {
    it('authenticates via Bearer API key', async () => {
      const mockUser = { id: 'u1', name: 'Test', role: 'pm' }
      setAuthUserLookup(async ({ apiKey }) => {
        if (apiKey === 'valid-key') return mockUser as Express.User
        return null
      })

      const req = createMockReq({
        headers: { authorization: 'Bearer valid-key' } as any,
      })
      const res = createMockRes()
      const next = vi.fn()

      await authenticate(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.user).toEqual(mockUser)
    })

    it('authenticates via JWT cookie', async () => {
      const mockUser = { id: 'u1', name: 'Test', role: 'pm' }
      setAuthUserLookup(async ({ userId }) => {
        if (userId === 'u1') return mockUser as Express.User
        return null
      })

      mockVerify.mockReturnValue({ userId: 'u1' })

      const req = createMockReq({
        cookies: { ctw_session: 'valid-jwt-token' },
      })
      const res = createMockRes()
      const next = vi.fn()

      await authenticate(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.user).toEqual(mockUser)
    })

    it('returns 401 when no credentials provided', async () => {
      setAuthUserLookup(async () => null)

      const req = createMockReq()
      const res = createMockRes()
      const next = vi.fn()

      await authenticate(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(401)
      expect(res._json).toEqual({ error: 'Authentication required' })
    })

    it('returns 401 for invalid API key', async () => {
      setAuthUserLookup(async () => null)

      const req = createMockReq({
        headers: { authorization: 'Bearer bad-key' } as any,
      })
      const res = createMockRes()
      const next = vi.fn()

      await authenticate(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(401)
    })

    it('returns 401 for invalid JWT', async () => {
      setAuthUserLookup(async () => null)
      mockVerify.mockImplementation(() => { throw new Error('invalid token') })

      const req = createMockReq({
        cookies: { ctw_session: 'bad-token' },
      })
      const res = createMockRes()
      const next = vi.fn()

      await authenticate(req, res, next)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(401)
    })

    it('prefers Bearer token over cookie', async () => {
      const apiUser = { id: 'api_user', name: 'API', role: 'pm' }
      setAuthUserLookup(async ({ apiKey }) => {
        if (apiKey === 'api-key') return apiUser as Express.User
        return null
      })

      const req = createMockReq({
        headers: { authorization: 'Bearer api-key' } as any,
        cookies: { ctw_session: 'some-cookie' },
      })
      const res = createMockRes()
      const next = vi.fn()

      await authenticate(req, res, next)

      expect(next).toHaveBeenCalled()
      expect(req.user).toEqual(apiUser)
    })
  })

  describe('requireRole', () => {
    it('allows user with matching role', () => {
      const middleware = requireRole('pm', 'techlead')
      const req = createMockReq()
      req.user = { id: 'u1', role: 'pm' } as Express.User
      const res = createMockRes()
      const next = vi.fn()

      middleware(req, res, next as NextFunction)

      expect(next).toHaveBeenCalled()
    })

    it('allows any of multiple specified roles', () => {
      const middleware = requireRole('pm', 'techlead')
      const req = createMockReq()
      req.user = { id: 'u1', role: 'techlead' } as Express.User
      const res = createMockRes()
      const next = vi.fn()

      middleware(req, res, next as NextFunction)

      expect(next).toHaveBeenCalled()
    })

    it('rejects user with non-matching role', () => {
      const middleware = requireRole('pm', 'techlead')
      const req = createMockReq()
      req.user = { id: 'u1', role: 'viewer' } as Express.User
      const res = createMockRes()
      const next = vi.fn()

      middleware(req, res, next as NextFunction)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(403)
      expect(res._json).toEqual({ error: 'Insufficient permissions' })
    })

    it('returns 401 when no user present', () => {
      const middleware = requireRole('pm')
      const req = createMockReq()
      const res = createMockRes()
      const next = vi.fn()

      middleware(req, res, next as NextFunction)

      expect(next).not.toHaveBeenCalled()
      expect(res._status).toBe(401)
    })
  })
})
