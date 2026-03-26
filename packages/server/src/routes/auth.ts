import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { getJwtSecret, authenticate } from '../middleware/auth.js'
import type * as schema from '../db/schema.js'

interface AuthRouterDeps {
  db: BetterSQLite3Database<typeof schema>
  users: typeof schema.users
}

export function createAuthRouter({ db, users }: AuthRouterDeps): Router {
  const router = Router()

  // POST /api/auth/login — authenticate with API key, set JWT cookie
  router.post('/login', async (req, res) => {
    try {
      const apiKey = req.body?.api_key
      if (!apiKey || typeof apiKey !== 'string') {
        res.status(400).json({ error: 'API key is required' })
        return
      }

      const user = db.select().from(users).where(eq(users.api_key, apiKey)).get()
      if (!user) {
        res.status(401).json({ error: 'Invalid API key' })
        return
      }

      // Create JWT and set as HttpOnly cookie
      const token = jwt.sign({ userId: user.id }, getJwtSecret(), { expiresIn: '7d' })

      res.cookie('ctw_session', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
      })

      res.json({
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar_url: user.avatar_url,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/auth/me — return current user from cookie or Bearer token
  router.get('/me', authenticate, (req, res) => {
    const user = req.user as { id: string; name: string; role: string }

    // Fetch full user data from DB
    const fullUser = db.select().from(users).where(eq(users.id, user.id)).get()
    if (!fullUser) {
      res.status(401).json({ error: 'User not found' })
      return
    }

    res.json({
      user: {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        role: fullUser.role,
        avatar_url: fullUser.avatar_url,
        created_at: fullUser.created_at,
        updated_at: fullUser.updated_at,
      },
    })
  })

  // POST /api/auth/logout — clear session cookie
  router.post('/logout', (_req, res) => {
    res.clearCookie('ctw_session', { path: '/' })
    res.status(204).send()
  })

  return router
}
