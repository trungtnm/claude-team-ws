import type { Request, Response, NextFunction } from 'express'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { vi } from 'vitest'
import * as schema from './db/schema.js'

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

type TestDb = BetterSQLite3Database<typeof schema>

interface SeedUserOverrides {
  id?: string
  name?: string
  email?: string
  role?: 'pm' | 'dev' | 'techlead' | 'viewer'
  api_key?: string
}

/** Tạo người dùng thử nghiệm trong DB và trả về record */
export function seedTestUser(db: TestDb, overrides: SeedUserOverrides = {}) {
  const id = overrides.id ?? nanoid()
  const values = {
    id,
    name: overrides.name ?? 'Người dùng thử nghiệm',
    email: overrides.email ?? `test-${id}@example.com`,
    role: overrides.role ?? 'pm',
    api_key: overrides.api_key ?? `test-key-${id}`,
  }

  db.insert(schema.users).values(values).run()

  return db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .get()!
}

interface SeedProjectOverrides {
  id?: string
  name?: string
  slug?: string
  project_root?: string
}

/** Tạo dự án thử nghiệm trong DB và trả về record */
export function seedTestProject(db: TestDb, overrides: SeedProjectOverrides = {}) {
  const id = overrides.id ?? nanoid()
  const values = {
    id,
    name: overrides.name ?? 'Dự án thử nghiệm',
    slug: overrides.slug ?? `test-project-${id}`,
    project_root: overrides.project_root ?? `/tmp/test-${id}`,
  }

  db.insert(schema.projects).values(values).run()

  return db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get()!
}
