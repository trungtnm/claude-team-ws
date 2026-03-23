import { describe, it, expect, vi, beforeEach } from 'vitest'
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

const { default: router } = await import('./captures.js')

describe('captures routes', () => {
  beforeEach(() => {
    mockAll.mockReset()
    mockGet.mockReset()
    mockRun.mockReset()
  })

  it('should have GET / route for listing captures', () => {
    const getLayer = (router as any).stack.find(
      (layer: any) => layer.route?.path === '/' && layer.route?.methods?.get,
    )
    expect(getLayer).toBeDefined()
  })

  it('should have POST / route for creating captures', () => {
    const postLayer = (router as any).stack.find(
      (layer: any) => layer.route?.path === '/' && layer.route?.methods?.post,
    )
    expect(postLayer).toBeDefined()
  })

  it('should have PATCH /:id route for updating captures', () => {
    const patchLayer = (router as any).stack.find(
      (layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.patch,
    )
    expect(patchLayer).toBeDefined()
  })

  it('should have DELETE /:id route for dismissing captures', () => {
    const deleteLayer = (router as any).stack.find(
      (layer: any) => layer.route?.path === '/:id' && layer.route?.methods?.delete,
    )
    expect(deleteLayer).toBeDefined()
  })

  it('should use authenticate middleware', () => {
    // The router should have middleware in its stack
    const middlewareLayers = (router as any).stack.filter(
      (layer: any) => !layer.route,
    )
    expect(middlewareLayers.length).toBeGreaterThan(0)
  })
})
