import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { BeadsService } from '../services/beads-service.js'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

const forceSyncSchema = z.object({
  confirm: z.literal(true),
  strategy: z.enum(['force_local', 'force_remote']),
})

export function createBeadsSyncRouter(deps: {
  beadsService: BeadsService
  projectRoot: string
}): RouterType {
  const { beadsService, projectRoot } = deps
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)

  // GET /api/projects/:projectId/beads-sync/status
  router.get('/status', async (_req, res) => {
    try {
      // Check git status of .beads/ directory
      let pendingChanges = false
      let syncError: string | null = null

      try {
        const { stdout } = await execFile('git', ['status', '--porcelain', '.beads/'], {
          cwd: projectRoot,
        })
        pendingChanges = stdout.trim().length > 0
      } catch (err) {
        syncError = err instanceof Error ? err.message : 'Failed to check git status'
      }

      // Check for rebase/merge conflicts
      let status: 'ok' | 'conflict' | 'paused' = 'ok'
      try {
        const { stdout } = await execFile('git', ['status', '--porcelain'], {
          cwd: projectRoot,
        })
        if (stdout.includes('UU ') || stdout.includes('AA ') || stdout.includes('DD ')) {
          status = 'conflict'
          syncError = 'Rebase conflict detected'
        }
      } catch {
        // ignore
      }

      // Get last sync timestamp from git log
      let lastSyncedAt: number | null = null
      try {
        const { stdout } = await execFile('git', [
          'log', '-1', '--format=%ct', '--', '.beads/issues.jsonl',
        ], { cwd: projectRoot })
        const ts = parseInt(stdout.trim())
        if (!isNaN(ts)) lastSyncedAt = ts
      } catch {
        // no commits touching beads yet
      }

      res.json({
        status,
        last_synced_at: lastSyncedAt,
        pending_changes: pendingChanges,
        error: syncError,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to check sync status'
      res.status(500).json({ error: message })
    }
  })

  // POST /api/projects/:projectId/beads-sync/resume
  router.post('/resume', requireRole('techlead'), async (_req, res) => {
    try {
      // Check if there are still conflicts
      const { stdout } = await execFile('git', ['status', '--porcelain'], {
        cwd: projectRoot,
      })

      if (stdout.includes('UU ') || stdout.includes('AA ') || stdout.includes('DD ')) {
        res.status(409).json({ error: 'Repo still has unresolved conflicts. Run: git status' })
        return
      }

      // Re-sync beads
      await beadsService.sync()

      res.json({ status: 'ok', message: 'Sync resumed' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to resume sync'
      res.status(500).json({ error: message })
    }
  })

  // POST /api/projects/:projectId/beads-sync/force
  router.post('/force', requireRole('techlead'), async (req, res) => {
    try {
      const parsed = forceSyncSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
        return
      }

      const { strategy } = parsed.data

      if (strategy === 'force_local') {
        // Export local DB and force push
        await beadsService.sync()
        await execFile('git', ['add', '.beads/issues.jsonl'], { cwd: projectRoot })
        try {
          await execFile('git', ['commit', '-m', 'chore: force sync beads (local wins)'], { cwd: projectRoot })
        } catch {
          // Nothing to commit — beads already in sync
        }
      } else {
        // Pull remote and reset local
        await execFile('git', ['checkout', '--', '.beads/issues.jsonl'], { cwd: projectRoot })
        // br will pick up the remote state on next read
      }

      res.json({ status: 'ok', strategy })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to force sync'
      res.status(500).json({ error: message })
    }
  })

  return router
}
