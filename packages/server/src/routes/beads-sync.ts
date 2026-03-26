import { Router, type Router as RouterType } from 'express'
import { authenticate, requireRole } from '../middleware/auth.js'
import type { BeadsService } from '../services/beads-service.js'

interface BeadsSyncRouterDeps {
  beadsService: BeadsService
  projectRoot: string
}

export function createBeadsSyncRouter({ beadsService, projectRoot }: BeadsSyncRouterDeps): RouterType {
  // Mounted at /api/projects/:projectId/beads-sync
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)

  // GET /status — sync status
  router.get('/status', async (_req, res) => {
    try {
      // Check if .beads directory exists and is accessible
      const list = await beadsService.list({ status: 'open' })
      res.json({
        status: 'ok',
        project_root: projectRoot,
        open_count: Array.isArray(list) ? list.length : 0,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Beads sync status check failed'
      res.json({
        status: 'error',
        project_root: projectRoot,
        error: message,
      })
    }
  })

  // POST /resume — resume after conflict
  router.post('/resume', requireRole('pm', 'techlead'), async (_req, res) => {
    try {
      await beadsService.sync()
      res.json({ status: 'synced' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume sync'
      res.status(500).json({ error: message })
    }
  })

  // POST /force — force sync
  router.post('/force', requireRole('pm', 'techlead'), async (_req, res) => {
    try {
      await beadsService.sync()
      res.json({ status: 'synced' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to force sync'
      res.status(500).json({ error: message })
    }
  })

  return router
}
