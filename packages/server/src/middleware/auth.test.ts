import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { nanoid } from 'nanoid'

const JWT_SECRET = 'test-secret-key'

// Mock db module - must be before importing auth
const mockGet = vi.fn()
vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mockGet,
        }),
      }),
    }),
  },
}))

// Import after mock
const { authenticate } = await import('./auth.js')

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

describe('authenticate middleware', () => {
  const testUser = {
    id: 'user-123',
    name: 'Test User',
    email: 'test@example.com',
    role: 'dev',
  }

  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', JWT_SECRET)
    mockGet.mockReset()
  })

  it('should authenticate via API key in Authorization header', async () => {
    mockGet.mockReturnValue(testUser)
    const req = mockReq({
      headers: { authorization: 'Bearer valid-api-key' },
    })
    const res = mockRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalled()
    expect((req as any).user).toEqual(testUser)
  })

  it('should authenticate via JWT cookie', async () => {
    mockGet.mockReturnValue(testUser)
    const token = jwt.sign({ userId: testUser.id }, JWT_SECRET, { expiresIn: '1h' })
    const req = mockReq({
      cookies: { ctw_session: token },
    })
    const res = mockRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalled()
    expect((req as any).user).toEqual(testUser)
  })

  it('should return 401 when no credentials provided', async () => {
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(res.json).toHaveBeenCalledWith({ error: 'Xác thực không hợp lệ' })
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for invalid API key', async () => {
    mockGet.mockReturnValue(undefined)
    const req = mockReq({
      headers: { authorization: 'Bearer invalid-key' },
    })
    const res = mockRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should return 401 for expired JWT', async () => {
    const token = jwt.sign({ userId: testUser.id }, JWT_SECRET, { expiresIn: '-1h' })
    const req = mockReq({
      cookies: { ctw_session: token },
    })
    const res = mockRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(res.status).toHaveBeenCalledWith(401)
    expect(next).not.toHaveBeenCalled()
  })

  it('should prefer API key over cookie when both present', async () => {
    mockGet.mockReturnValue(testUser)
    const token = jwt.sign({ userId: 'other-id' }, JWT_SECRET, { expiresIn: '1h' })
    const req = mockReq({
      headers: { authorization: 'Bearer valid-api-key' },
      cookies: { ctw_session: token },
    })
    const res = mockRes()
    const next = vi.fn()

    await authenticate(req, res, next)

    expect(next).toHaveBeenCalled()
    expect((req as any).user).toEqual(testUser)
  })
})
