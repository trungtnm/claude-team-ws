import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'

export interface AuthUser {
  id: string
  name: string
  email: string | null
  role: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Try API key first (Authorization: Bearer <api_key>)
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.slice(7)
    const user = db
      .select({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })
      .from(schema.users)
      .where(eq(schema.users.api_key, apiKey))
      .get()

    if (user) {
      req.user = user
      next()
      return
    }

    res.status(401).json({ error: 'Xác thực không hợp lệ' })
    return
  }

  // Try JWT cookie (ctw_session)
  const token = req.cookies?.ctw_session
  if (token) {
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      res.status(500).json({ error: 'JWT_SECRET chưa được cấu hình' })
      return
    }

    try {
      const payload = jwt.verify(token, jwtSecret) as { userId: string }
      const user = db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
        })
        .from(schema.users)
        .where(eq(schema.users.id, payload.userId))
        .get()

      if (user) {
        req.user = user
        next()
        return
      }
    } catch {
      // JWT verification failed
    }

    res.status(401).json({ error: 'Xác thực không hợp lệ' })
    return
  }

  res.status(401).json({ error: 'Xác thực không hợp lệ' })
}
