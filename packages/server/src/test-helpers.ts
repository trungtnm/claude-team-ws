import type { Request, Response, NextFunction } from 'express'
import { vi } from 'vitest'

export const testUser = {
  id: 'user-123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'pm',
}

/** Injects req.user for tests, bypassing real auth */
export function fakeAuth(user = testUser) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    req.user = user
    next()
  }
}

export function mockRes(): Response {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    clearCookie: vi.fn().mockReturnThis(),
    cookie: vi.fn().mockReturnThis(),
    sendStatus: vi.fn().mockReturnThis(),
  }
  return res as unknown as Response
}
