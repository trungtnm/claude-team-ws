import { Router, type Router as RouterType } from 'express'
import { authenticate } from '../middleware/auth.js'
import { BvService } from '../services/bv-service.js'

export function createGraphRouter(deps: {
  bvService: BvService
}): RouterType {
  const { bvService } = deps
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)

  // GET /api/projects/:projectId/graph
  router.get('/', async (_req, res) => {
    try {
      const graphData = await bvService.getGraph('json')

      // bv --robot-graph returns raw graph data
      // Transform into React Flow compatible format
      const raw = graphData as {
        nodes?: Array<{ id: string; title: string; status: string; priority: number; issue_type: string; labels?: string[] }>
        edges?: Array<{ from: string; to: string; type: string }>
      }

      const nodes = (raw.nodes || []).map((n) => ({
        id: n.id,
        title: n.title,
        status: n.status,
        priority: n.priority,
        type: n.issue_type,
        labels: n.labels,
      }))

      const edges = (raw.edges || []).map((e) => ({
        source: e.from,
        target: e.to,
        type: e.type || 'blocks',
      }))

      // Fetch insights for enrichment
      let insights = null
      try {
        const insightsData = await bvService.getInsights() as Record<string, unknown>
        insights = {
          critical_path: (insightsData.CriticalPath as string[]) || [],
          bottlenecks: ((insightsData.Betweenness as Array<{ id: string; score: number }>) || [])
            .slice(0, 5)
            .map((b) => ({ id: b.id, betweenness: b.score })),
          ready: ((insightsData.ReadyNodes as string[]) || []),
        }
      } catch {
        // insights may timeout on large graphs
      }

      res.json({ nodes, edges, insights })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get graph data'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/projects/:projectId/graph/triage
  router.get('/triage', async (_req, res) => {
    try {
      const triage = await bvService.getTriage()
      res.json(triage)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get triage data'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/projects/:projectId/graph/plan
  router.get('/plan', async (req, res) => {
    try {
      const label = req.query.label as string | undefined
      const plan = await bvService.getPlan(label)
      res.json(plan)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get plan data'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/projects/:projectId/graph/alerts
  router.get('/alerts', async (_req, res) => {
    try {
      const alerts = await bvService.getAlerts()
      res.json(alerts)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get alerts'
      res.status(500).json({ error: message })
    }
  })

  // GET /api/projects/:projectId/graph/label-health
  router.get('/label-health', async (_req, res) => {
    try {
      const health = await bvService.getLabelHealth()
      res.json(health)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get label health'
      res.status(500).json({ error: message })
    }
  })

  return router
}
