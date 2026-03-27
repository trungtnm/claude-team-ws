import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and, desc, count, sql, gt } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schemaTypes from '../db/schema.js'
import { activityLog, users, sessions, captures, epics } from '../db/schema.js'
import { logError } from '../utils/log-error.js'

interface ActivityRouterDeps {
  db: BetterSQLite3Database<typeof schemaTypes>
}

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

export function createActivityRouter({ db }: ActivityRouterDeps): RouterType {
  // Mounted at /api/projects/:projectId/activity
  const router: RouterType = Router({ mergeParams: true })

  // GET / — paginated activity log entries joined with user name
  router.get('/', (req, res) => {
    try {
      const projectId = param(req, 'projectId')
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 200)
      const offset = parseInt(req.query.offset as string) || 0
      const action = req.query.action as string | undefined

      const conditions = action
        ? and(
            eq(activityLog.project_id, projectId),
            eq(activityLog.action, action as typeof activityLog.action.enumValues[number]),
          )
        : eq(activityLog.project_id, projectId)

      const rows = db
        .select({
          id: activityLog.id,
          action: activityLog.action,
          details: activityLog.details,
          created_at: activityLog.created_at,
          user_id: activityLog.user_id,
          user_name: users.name,
        })
        .from(activityLog)
        .leftJoin(users, eq(activityLog.user_id, users.id))
        .where(conditions)
        .orderBy(desc(activityLog.created_at))
        .limit(limit)
        .offset(offset)
        .all()

      const totalResult = db
        .select({ count: count() })
        .from(activityLog)
        .where(conditions)
        .get()

      res.json({ activity: rows, total: totalResult?.count ?? 0 })
    } catch (err) {
      res.status(500).json({ error: logError('activity', err) })
    }
  })

  // GET /metrics — aggregated project stats
  router.get('/metrics', (req, res) => {
    try {
      const projectId = param(req, 'projectId')

      // Session metrics
      const sessionRows = db
        .select({
          status: sessions.status,
          count: count(),
        })
        .from(sessions)
        .where(eq(sessions.project_id, projectId))
        .groupBy(sessions.status)
        .all()

      const sessionCounts: Record<string, number> = {}
      let sessionTotal = 0
      for (const row of sessionRows) {
        sessionCounts[row.status] = row.count
        sessionTotal += row.count
      }
      const completed = sessionCounts['completed'] ?? 0
      const failed = sessionCounts['failed'] ?? 0
      const finished = completed + failed
      const successRate = finished > 0 ? Math.round((completed / finished) * 100) : 0

      // Capture metrics
      const captureRows = db
        .select({
          status: captures.status,
          count: count(),
        })
        .from(captures)
        .where(eq(captures.project_id, projectId))
        .groupBy(captures.status)
        .all()

      const captureCounts: Record<string, number> = {}
      let captureTotal = 0
      for (const row of captureRows) {
        captureCounts[row.status] = row.count
        captureTotal += row.count
      }

      // Epic metrics
      const epicRows = db
        .select({
          ui_status: epics.ui_status,
          count: count(),
        })
        .from(epics)
        .where(eq(epics.project_id, projectId))
        .groupBy(epics.ui_status)
        .all()

      const epicByStatus: Record<string, number> = {}
      let epicTotal = 0
      for (const row of epicRows) {
        epicByStatus[row.ui_status] = row.count
        epicTotal += row.count
      }

      // PR metrics — sessions that have pr_url set
      const prRows = db
        .select({
          pr_status: sessions.pr_status,
          count: count(),
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.project_id, projectId),
            sql`${sessions.pr_url} IS NOT NULL`,
          ),
        )
        .groupBy(sessions.pr_status)
        .all()

      const prCounts: Record<string, number> = {}
      for (const row of prRows) {
        const key = row.pr_status ?? 'unknown'
        prCounts[key] = row.count
      }
      const prOpen = (prCounts['pending_review'] ?? 0) + (prCounts['changes_requested'] ?? 0) + (prCounts['approved'] ?? 0)
      const prMerged = prCounts['merged'] ?? 0

      // Average cycle time (started_at to finished_at) for completed sessions, in hours
      const cycleResult = db
        .select({
          avg_cycle: sql<number>`AVG(${sessions.finished_at} - ${sessions.started_at})`,
        })
        .from(sessions)
        .where(
          and(
            eq(sessions.project_id, projectId),
            eq(sessions.status, 'completed'),
            sql`${sessions.started_at} IS NOT NULL`,
            sql`${sessions.finished_at} IS NOT NULL`,
          ),
        )
        .get()

      const avgCycleSeconds = cycleResult?.avg_cycle ?? 0
      const avgCycleHours = Math.round((avgCycleSeconds / 3600) * 10) / 10

      res.json({
        sessions: {
          total: sessionTotal,
          completed,
          failed,
          running: sessionCounts['running'] ?? 0,
          successRate,
        },
        captures: {
          total: captureTotal,
          pending: captureCounts['pending'] ?? 0,
          triaged: captureCounts['triaged'] ?? 0,
          deferred: captureCounts['deferred'] ?? 0,
        },
        epics: {
          total: epicTotal,
          byStatus: {
            blocked: epicByStatus['blocked'] ?? 0,
            ready: epicByStatus['ready'] ?? 0,
            in_progress: epicByStatus['in_progress'] ?? 0,
            in_review: epicByStatus['in_review'] ?? 0,
            done: epicByStatus['done'] ?? 0,
          },
        },
        prs: {
          open: prOpen,
          merged: prMerged,
          avgCycleHours,
        },
      })
    } catch (err) {
      res.status(500).json({ error: logError('activity-metrics', err) })
    }
  })

  return router
}
