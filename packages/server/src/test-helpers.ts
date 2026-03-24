import type { Request, Response, NextFunction } from 'express'
import { nanoid } from 'nanoid'
import type { AuthUser } from './middleware/auth.js'

/**
 * Create a seed test user record for insertion into the test DB.
 */
export function seedTestUser(overrides: Partial<{
  id: string
  name: string
  email: string
  role: AuthUser['role']
  api_key: string
  avatar_url: string | null
}> = {}) {
  const id = overrides.id ?? nanoid()
  return {
    id,
    name: overrides.name ?? `Test User ${id.slice(0, 4)}`,
    email: overrides.email ?? `test-${id.slice(0, 4)}@example.com`,
    role: overrides.role ?? 'dev' as const,
    api_key: overrides.api_key ?? `ctw-test-${nanoid(12)}`,
    avatar_url: overrides.avatar_url ?? null,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Create a seed test project record for insertion into the test DB.
 */
export function seedTestProject(overrides: Partial<{
  id: string
  name: string
  slug: string
  project_root: string
  max_concurrent_agents: number
  ask_question_mode: string
}> = {}) {
  const id = overrides.id ?? nanoid()
  return {
    id,
    name: overrides.name ?? `Test Project ${id.slice(0, 4)}`,
    slug: overrides.slug ?? `test-${id.slice(0, 6)}`,
    project_root: overrides.project_root ?? `/tmp/ctw-test-${id.slice(0, 6)}`,
    max_concurrent_agents: overrides.max_concurrent_agents ?? 3,
    ask_question_mode: overrides.ask_question_mode ?? 'pause',
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  }
}

/**
 * Fake auth middleware for integration tests.
 * Injects a given user into req.user, bypassing real auth.
 */
export function fakeAuth(user: AuthUser) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.user = user
    next()
  }
}

/**
 * Create a mock Express Response object for unit tests.
 */
export function mockRes() {
  const res: Partial<Response> = {
    status: function (code: number) {
      (this as Record<string, unknown>).statusCode = code
      return this as Response
    },
    json: function (body: unknown) {
      (this as Record<string, unknown>).body = body
      return this as Response
    },
    cookie: function () {
      return this as Response
    },
    clearCookie: function () {
      return this as Response
    },
  }
  return res as Response & { statusCode?: number; body?: unknown }
}
