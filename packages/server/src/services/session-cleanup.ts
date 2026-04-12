import { eq, and, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { sessions, sessionEvents, projects, notifications, activityLog } from '../db/schema.js'
import { emitToProject } from './socket-manager.js'
import { GitService } from './git-service.js'

// ─── Configuration ─────────────────────────────────────────────────────────

const IDLE_TTL_HOURS = parseInt(process.env.SESSION_IDLE_TTL_HOURS || '24', 10)
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000 // Run every hour

// ─── Session Cleanup Service ─────────────────────────────────────────────

class SessionCleanupService {
  private interval: ReturnType<typeof setInterval> | null = null

  start(): void {
    // Run immediately on startup, then on interval
    this.runCleanup()
    this.interval = setInterval(() => this.runCleanup(), CLEANUP_INTERVAL_MS)
    console.log(`[SessionCleanup] started — auto-completing idle sessions after ${IDLE_TTL_HOURS}h`)
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    console.log('[SessionCleanup] stopped')
  }

  /** Auto-complete sessions that have been idle for longer than IDLE_TTL_HOURS */
  runCleanup(): number {
    const now = Math.floor(Date.now() / 1000)
    const cutoff = now - (IDLE_TTL_HOURS * 3600)

    // Find idle sessions where the last event is older than the cutoff
    const idleSessions = db
      .select()
      .from(sessions)
      .where(eq(sessions.status, 'idle'))
      .all()

    let autoCompleted = 0

    for (const session of idleSessions) {
      // Check the last event timestamp for this session
      const lastEvent = db
        .select({ created_at: sessionEvents.created_at })
        .from(sessionEvents)
        .where(eq(sessionEvents.session_id, session.id))
        .orderBy(sql`${sessionEvents.id} DESC`)
        .limit(1)
        .get()

      const lastActivity = lastEvent?.created_at ?? session.started_at ?? session.created_at
      if (lastActivity > cutoff) continue // Not old enough

      // Auto-complete this session
      db.update(sessions)
        .set({ status: 'completed', finished_at: now })
        .where(eq(sessions.id, session.id))
        .run()

      // Log activity
      db.insert(activityLog).values({
        project_id: session.project_id,
        user_id: session.user_id,
        action: 'session_completed',
        details: JSON.stringify({
          session_id: session.id,
          name: session.name,
          reason: `Auto-completed after ${IDLE_TTL_HOURS}h idle`,
        }),
      }).run()

      // Create notification for the session owner
      db.insert(notifications).values({
        id: `notif_auto_${session.id}_${Date.now()}`,
        user_id: session.user_id,
        project_id: session.project_id,
        type: 'agent_complete',
        title: 'Session auto-completed',
        body: `Session "${session.name || session.prompt.slice(0, 50)}" was auto-completed after ${IDLE_TTL_HOURS}h idle.`,
        link: `/agents/${session.id}`,
      }).run()

      // Emit lifecycle event
      emitToProject(session.project_id, 'session:lifecycle', {
        session: { ...session, status: 'completed', finished_at: now },
        action: 'auto_completed',
      })

      // Clean up worktree if present
      if (session.worktree_path) {
        this.cleanupWorktree(session).catch((err) => {
          console.warn(`[SessionCleanup] worktree cleanup failed for ${session.id}: ${err}`)
        })
      }

      autoCompleted++
    }

    // Prune orphaned worktrees across all project repos
    this.pruneOrphanedWorktrees()

    if (autoCompleted > 0) {
      console.log(`[SessionCleanup] auto-completed ${autoCompleted} idle session(s)`)
    }

    return autoCompleted
  }

  /** Remove worktree and optionally push branch based on merge strategy */
  private async cleanupWorktree(session: typeof sessions.$inferSelect): Promise<void> {
    if (!session.worktree_path || !session.worktree_branch) return

    const repoPath = session.target_dir || '.'
    const gitService = new GitService(repoPath)
    const project = db.select().from(projects).where(eq(projects.id, session.project_id)).get()
    const strategy = project?.worktree_merge_strategy || 'leave'

    try {
      if (strategy === 'push' || strategy === 'pr') {
        await gitService.pushBranch(session.worktree_branch, session.worktree_path)
      }
      await gitService.worktreeRemove(repoPath, session.worktree_path)
    } catch (err) {
      console.warn(`[SessionCleanup] worktree cleanup error: ${err}`)
    }
  }

  /** Prune orphaned worktree entries from repos that have had worktree sessions */
  private pruneOrphanedWorktrees(): void {
    const reposWithWorktrees = db
      .select({ project_root: projects.project_root })
      .from(sessions)
      .innerJoin(projects, eq(sessions.project_id, projects.id))
      .where(sql`${sessions.worktree_path} IS NOT NULL`)
      .groupBy(projects.project_root)
      .all()
    for (const repo of reposWithWorktrees) {
      const gitService = new GitService(repo.project_root)
      gitService.worktreePrune(repo.project_root).catch(() => {})
    }
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let cleanup: SessionCleanupService | null = null

export function initSessionCleanup(): SessionCleanupService {
  cleanup = new SessionCleanupService()
  cleanup.start()
  return cleanup
}

export function stopSessionCleanup(): void {
  cleanup?.stop()
  cleanup = null
}
