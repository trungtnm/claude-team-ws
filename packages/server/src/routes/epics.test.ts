import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'

const mockAll = vi.fn()
const mockGet = vi.fn()
const mockRun = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          get: mockGet,
          orderBy: () => ({
            all: mockAll,
          }),
        }),
        orderBy: () => ({
          all: mockAll,
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        run: mockRun,
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          run: mockRun,
        }),
      }),
    }),
  },
}))

vi.mock('../middleware/auth.js', () => ({
  authenticate: (req: Request, _res: Response, next: () => void) => {
    req.user = { id: 'user-123', name: 'Test', email: 'test@example.com', role: 'pm' }
    next()
  },
}))

vi.mock('../middleware/rbac.js', () => ({
  requireRole: (..._roles: string[]) => (_req: Request, _res: Response, next: () => void) => next(),
}))

const { default: router } = await import('./epics.js')

describe('epics routes', () => {
  it('should have GET / for listing epics', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    )
    expect(layer).toBeDefined()
  })

  it('should have POST / for creating epics', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.post,
    )
    expect(layer).toBeDefined()
  })

  it('should have PATCH /:id for updating epics', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/:id' && l.route?.methods?.patch,
    )
    expect(layer).toBeDefined()
  })

  it('should have GET /:id for getting epic details', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/:id' && l.route?.methods?.get,
    )
    expect(layer).toBeDefined()
  })

  it('should use authenticate middleware', () => {
    const middlewareLayers = (router as any).stack.filter(
      (l: any) => !l.route,
    )
    expect(middlewareLayers.length).toBeGreaterThan(0)
  })
})
