/**
 * Shared test utilities for server route unit tests.
 *
 * Provides mock middleware, mock DB helpers, and Express app factory
 * for testing routes in isolation with supertest.
 */
import express, { type Request, type Response, type NextFunction } from 'express'
import cookieParser from 'cookie-parser'

/** A mock user for tests — default role is 'pm' (highest permissions) */
export interface MockUser {
  id: string
  name: string
  email: string
  role: 'pm' | 'dev' | 'techlead' | 'viewer'
  avatar_url: string | null
  api_key: string | null
  created_at: number
  updated_at: number
}

export const testUser: MockUser = {
  id: 'user_test123',
  name: 'Test User',
  email: 'test@example.com',
  role: 'pm',
  avatar_url: null,
  api_key: 'test-api-key',
  created_at: 1000000,
  updated_at: 1000000,
}

export const testViewer: MockUser = {
  ...testUser,
  id: 'user_viewer',
  name: 'Viewer User',
  role: 'viewer',
}

export const testDev: MockUser = {
  ...testUser,
  id: 'user_dev',
  name: 'Dev User',
  role: 'dev',
}

/**
 * Middleware that injects a mock user into req.user.
 * Use `setMockUser()` to change the user between requests.
 */
let currentMockUser: MockUser | null = testUser

export function setMockUser(user: MockUser | null): void {
  currentMockUser = user
}

export function mockAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  if (currentMockUser) {
    req.user = currentMockUser as Express.User
    next()
  } else {
    _res.status(401).json({ error: 'Authentication required' })
  }
}

export function mockRequireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as MockUser | undefined
    if (!user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}

export function mockRequireProjectMember(req: Request, _res: Response, next: NextFunction): void {
  next()
}

/**
 * Create a minimal Express app for testing a router.
 * Includes JSON body parsing, cookie parsing, and the provided router.
 */
export function createTestApp(router: express.Router, mountPath = '/'): express.Express {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(mountPath, router)
  return app
}

/** Reset mock state between tests */
export function resetMocks(): void {
  currentMockUser = testUser
}
