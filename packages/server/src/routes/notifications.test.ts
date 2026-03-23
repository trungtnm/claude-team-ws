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

const { default: router } = await import('./notifications.js')

describe('notifications routes', () => {
  it('should have GET / for listing notifications', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    )
    expect(layer).toBeDefined()
  })

  it('should have PATCH /:id/read for marking as read', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/:id/read' && l.route?.methods?.patch,
    )
    expect(layer).toBeDefined()
  })

  it('should have PATCH /read-all for marking all as read', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/read-all' && l.route?.methods?.patch,
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
