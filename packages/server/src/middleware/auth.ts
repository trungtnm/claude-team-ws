import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: 'pm' | 'dev' | 'techlead' | 'viewer'
  avatar_url: string | null
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET === 'change-me-to-a-random-secret') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a secure random value in production')
  }
  console.warn('⚠ JWT_SECRET not set — using insecure default. Set JWT_SECRET in .env for production.')
}
const jwtSecret = JWT_SECRET || 'dev-only-insecure-default'

export function getJwtSecret(): string {
  return jwtSecret
}

/** User lookup function type — injected from index.ts after DB is ready */
type UserLookupFn = (criteria: { apiKey?: string; userId?: string }) => Promise<AuthUser | null>

let findUser: UserLookupFn = async () => null

/** Set the user lookup function (called from index.ts after DB is initialized) */
export function setAuthUserLookup(fn: UserLookupFn): void {
  findUser = fn
}

/**
 * Dual auth middleware: Bearer API key OR JWT cookie (ctw_session).
 * Attaches req.user on success, returns 401 if neither is valid.
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    // Try Bearer API key first
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      const apiKey = authHeader.slice(7)
      const user = await findUser({ apiKey })
      if (user) {
        req.user = user
        next()
        return
      }
    }

    // Try JWT cookie
    const token = req.cookies?.ctw_session
    if (token) {
      const payload = jwt.verify(token, jwtSecret) as { userId: string }
      const user = await findUser({ userId: payload.userId })
      if (user) {
        req.user = user
        next()
        return
      }
    }

    res.status(401).json({ error: 'Authentication required' })
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
