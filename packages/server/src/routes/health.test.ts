import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Request, Response } from 'express'

vi.mock('child_process', () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: (err: Error | null, result: { stdout: string }) => void) => {
    cb(null, { stdout: '/usr/bin/mock' })
  }),
}))

// Mock global fetch for service checks
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { default: router } = await import('./health.js')

describe('health routes', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('should have GET / health check route', () => {
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === '/' && l.route?.methods?.get,
    )
    expect(layer).toBeDefined()
  })

  it('should not require authentication', () => {
    // Health routes should not have authenticate middleware in the stack
    const middlewareLayers = (router as any).stack.filter(
      (l: any) => !l.route,
    )
    // No auth middleware should be present
    expect(middlewareLayers.length).toBe(0)
  })

  it('should check CLI tools and return status', async () => {
    const handler = (router as any).stack
      .find((l: any) => l.route?.path === '/')
      ?.route?.stack?.find((s: any) => s.method === 'get')?.handle

    if (!handler) return

    const req = {} as Request
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response

    await handler(req, res)

    expect(res.json).toHaveBeenCalled()
    const result = (res.json as any).mock.calls[0][0]
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('tools')
    expect(result).toHaveProperty('services')
    expect(result.tools).toHaveLength(6) // claude, br, bv, cass, gh, git
  })
})
