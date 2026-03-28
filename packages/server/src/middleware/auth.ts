import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'crypto'

// JWT secret — must be set in production
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET === 'change-me-to-a-random-secret') {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set to a secure random value in production')
  }
  console.warn('⚠ JWT_SECRET not set — generating ephemeral secret (sessions will not survive restart)')
}
const jwtSecret = JWT_SECRET || randomBytes(32).toString('hex')

export function getJwtSecret(): string {
  return jwtSecret
}

// User lookup function — set by the main server on startup
type UserLookup = (params: { apiKey?: string; userId?: string }) => Promise<Express.User | null>
let findUser: UserLookup = async () => null

export function setAuthUserLookup(fn: UserLookup): void {
  findUser = fn
}

// Express middleware — authenticates via Bearer token (API key) or HttpOnly cookie (JWT)
export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Try API key from Authorization header
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

    // Try JWT from HttpOnly cookie
    const token = req.cookies?.ctw_session
    if (token) {
      const payload = jwt.verify(token, jwtSecret, { issuer: 'ctw', audience: 'ctw-api' }) as { userId: string }
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

// Role-based access middleware
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    const userRole = (user as { role: string }).role
    if (!roles.includes(userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }

    next()
  }
}
