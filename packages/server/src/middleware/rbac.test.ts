import { describe, it, expect, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { requireRole } from './rbac.js'

function mockReq(user?: { role: string }): Request {
  return { user } as unknown as Request
}

function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}

describe('requireRole middleware', () => {
  it('should allow access when user role matches', () => {
    const middleware = requireRole('pm', 'techlead')
    const req = mockReq({ role: 'pm' })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(next).toHaveBeenCalled()
  })

  it('should deny access when user role does not match', () => {
    const middleware = requireRole('pm', 'techlead')
    const req = mockReq({ role: 'viewer' })
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Không có quyền truy cập' })
    expect(next).not.toHaveBeenCalled()
  })

  it('should deny access when no user on request', () => {
    const middleware = requireRole('pm')
    const req = mockReq()
    const res = mockRes()
    const next = vi.fn()

    middleware(req, res, next)

    expect(res.status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
