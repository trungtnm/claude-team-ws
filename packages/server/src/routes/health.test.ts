import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}))

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal<typeof import('util')>()
  return {
    ...actual,
    promisify: () => mockExecFileAsync,
  }
})

vi.mock('../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: any, _res: any, next: any) => next()),
  requireRole: vi.fn((..._roles: string[]) => (_req: any, _res: any, next: any) => next()),
}))

import healthRouter from './health.js'
import { authenticate } from '../middleware/auth.js'

function createApp() {
  const app = express()
  app.use(express.json())
  app.use('/api/health', healthRouter)
  return app
}

describe('Health Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/health', () => {
    it('returns status ok', async () => {
      const app = createApp()
      const res = await request(app).get('/api/health')

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ status: 'ok' })
    })
  })

  describe('GET /api/health/diagnostics', () => {
    it('returns CLI tool and docker service checks when all available', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '/usr/local/bin/tool' })

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockResolvedValue(new Response('ok'))

      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'u1', role: 'techlead' }
          next()
        },
      )

      const app = createApp()
      const res = await request(app).get('/api/health/diagnostics')

      expect(res.status).toBe(200)
      expect(res.body.status).toBe('ok')
      expect(res.body).toHaveProperty('cliTools')
      expect(res.body).toHaveProperty('dockerServices')
      expect(res.body).toHaveProperty('uptime')
      expect(res.body.cliTools.claude).toBe(true)
      expect(res.body.cliTools.git).toBe(true)
      expect(res.body.dockerServices.agentMail).toBe(true)
      expect(res.body.dockerServices.cm).toBe(true)

      global.fetch = originalFetch
    })

    it('reports unavailable tools and services as false', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('not found'))

      const originalFetch = global.fetch
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'))

      ;(authenticate as ReturnType<typeof vi.fn>).mockImplementation(
        (req: any, _res: any, next: any) => {
          req.user = { id: 'u1', role: 'techlead' }
          next()
        },
      )

      const app = createApp()
      const res = await request(app).get('/api/health/diagnostics')

      expect(res.status).toBe(200)
      expect(res.body.cliTools.claude).toBe(false)
      expect(res.body.cliTools.br).toBe(false)
      expect(res.body.cliTools.git).toBe(false)
      expect(res.body.dockerServices.agentMail).toBe(false)
      expect(res.body.dockerServices.cm).toBe(false)

      global.fetch = originalFetch
    })
  })
})
