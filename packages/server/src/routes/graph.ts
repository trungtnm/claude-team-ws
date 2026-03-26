import { Router, type Router as RouterType } from 'express'
import { authenticate } from '../middleware/auth.js'
import type { BvService } from '../services/bv-service.js'
import { logError } from '../utils/log-error.js'

interface GraphRouterDeps {
  bvService: BvService
}

export function createGraphRouter({ bvService }: GraphRouterDeps): RouterType {
  // Mounted at /api/projects/:projectId/graph
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)

  // GET / — get dependency graph
  router.get('/', async (req, res) => {
    try {
      const format = (req.query.format as string) || 'json'
      const graph = await bvService.getGraph(format)
      res.json({ graph })
    } catch (err) {
      res.status(500).json({ error: logError('graph', err) })
    }
  })

  // GET /triage — get triage data
  router.get('/triage', async (_req, res) => {
    try {
      const triage = await bvService.getTriage()
      res.json({ triage })
    } catch (err) {
      res.status(500).json({ error: logError('graph', err) })
    }
  })

  // GET /plan — get plan data
  router.get('/plan', async (req, res) => {
    try {
      const label = req.query.label as string | undefined
      const plan = await bvService.getPlan(label)
      res.json({ plan })
    } catch (err) {
      res.status(500).json({ error: logError('graph', err) })
    }
  })

  return router
}
