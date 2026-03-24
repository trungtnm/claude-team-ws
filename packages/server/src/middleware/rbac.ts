import type { Request, Response, NextFunction } from 'express'
import type { AuthUser } from './auth.js'

type Role = AuthUser['role']

/**
 * RBAC middleware factory. Returns 403 if user's role is not in the allowed list.
 * Must be used AFTER authenticate middleware (requires req.user).
 *
 * Usage: router.post('/', requireRole('pm', 'techlead'), handler)
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        error: `Forbidden: requires one of [${allowedRoles.join(', ')}], you have '${user.role}'`,
      })
      return
    }

    next()
  }
}
