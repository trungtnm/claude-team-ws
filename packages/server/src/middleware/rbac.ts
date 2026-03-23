import type { Request, Response, NextFunction } from 'express'

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRole = req.user?.role
    if (!userRole || !roles.includes(userRole)) {
      res.status(403).json({ error: 'Không có quyền truy cập' })
      return
    }
    next()
  }
}
