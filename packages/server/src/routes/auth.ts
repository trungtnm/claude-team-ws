import { Router } from 'express'
import { z } from 'zod'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getJwtSecret, authenticate, setAuthUserLookup } from '../middleware/auth.js'
import type { AuthUser } from '../middleware/auth.js'
import type * as schemaTypes from '../db/schema.js'

const loginSchema = z.object({
  api_key: z.string().min(1),
})

export function createAuthRouter(deps: {
  db: BetterSQLite3Database<typeof schemaTypes>
  users: typeof schemaTypes.users
}): Router {
  const { db, users } = deps

  // Register the user lookup function for the auth middleware
  setAuthUserLookup(async (criteria) => {
    const { apiKey, userId } = criteria

    if (apiKey) {
      const row = db.select().from(users).where(eq(users.api_key, apiKey)).get()
      if (row) return mapUserRow(row)
    } else if (userId) {
      const row = db.select().from(users).where(eq(users.id, userId)).get()
      if (row) return mapUserRow(row)
    }

    return null
  })

  const router = Router()

  // POST /api/auth/login
  router.post('/login', async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request', details: parsed.error.issues })
        return
      }

      const { api_key } = parsed.data

      const row = db.select().from(users).where(eq(users.api_key, api_key)).get()

      if (!row) {
        res.status(401).json({ error: 'Invalid API key' })
        return
      }

      const user = mapUserRow(row)
      const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' })

      res.cookie('ctw_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      })

      res.json({ user })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/auth/me
  router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user })
  })

  // POST /api/auth/logout
  router.post('/logout', (_req, res) => {
    res.clearCookie('ctw_session')
    res.json({ ok: true })
  })

  return router
}

function mapUserRow(row: { id: string; name: string; email: string | null; role: string; avatar_url: string | null }): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email ?? '',
    role: row.role as AuthUser['role'],
    avatar_url: row.avatar_url,
  }
}
