import { watch, existsSync, type FSWatcher } from 'fs'
import { join } from 'path'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects, repos } from '../db/schema.js'
import { emitToProject } from './socket-manager.js'

// ─── Types ─────────────────────────────────────────────────────────────────

interface WatchEntry {
  watcher: FSWatcher
  projectId: string
  scope: 'project' | 'repo'
  repoId?: string
}

// ─── Config Watcher ────────────────────────────────────────────────────────

class ConfigWatcher {
  private watchers = new Map<string, WatchEntry>()
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  /** Start watching .claude/ directories for all projects */
  start(): void {
    const allProjects = db.select().from(projects).all()

    for (const project of allProjects) {
      this.watchDir(project.id, project.project_root, 'project')

      // Watch each repo's .claude/ too
      const projectRepos = db
        .select()
        .from(repos)
        .where(eq(repos.project_id, project.id))
        .all()

      for (const repo of projectRepos) {
        this.watchDir(project.id, repo.path, 'repo', repo.id)
      }
    }

    console.log(`[ConfigWatcher] watching ${this.watchers.size} .claude/ directories`)
  }

  /** Stop all watchers */
  stop(): void {
    for (const entry of this.watchers.values()) {
      entry.watcher.close()
    }
    this.watchers.clear()
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer)
    }
    this.debounceTimers.clear()
    console.log('[ConfigWatcher] stopped')
  }

  /** Add a watcher for a specific project or repo */
  watchDir(projectId: string, basePath: string, scope: 'project' | 'repo', repoId?: string): void {
    const claudeDir = join(basePath, '.claude')
    const key = repoId ? `${projectId}:${repoId}` : projectId

    // Skip if already watching or directory doesn't exist
    if (this.watchers.has(key)) return
    if (!existsSync(claudeDir)) return

    try {
      const watcher = watch(claudeDir, { recursive: true }, (_event, filename) => {
        if (!filename) return
        this.debouncedEmit(key, projectId, scope, repoId, filename)
      })

      watcher.on('error', (err) => {
        console.warn(`[ConfigWatcher] error watching ${claudeDir}: ${err.message}`)
        watcher.close()
        this.watchers.delete(key)
      })

      this.watchers.set(key, { watcher, projectId, scope, repoId })
    } catch (err) {
      console.warn(`[ConfigWatcher] failed to watch ${claudeDir}: ${err}`)
    }
  }

  /** Remove watcher for a project or repo */
  unwatchDir(projectId: string, repoId?: string): void {
    const key = repoId ? `${projectId}:${repoId}` : projectId
    const entry = this.watchers.get(key)
    if (entry) {
      entry.watcher.close()
      this.watchers.delete(key)
    }
    // Clear pending debounce timers for this key
    for (const [timerKey, timer] of this.debounceTimers) {
      if (timerKey.startsWith(`${key}:`)) {
        clearTimeout(timer)
        this.debounceTimers.delete(timerKey)
      }
    }
  }

  /** Debounce rapid file changes (300ms) */
  private debouncedEmit(
    key: string,
    projectId: string,
    scope: 'project' | 'repo',
    repoId: string | undefined,
    filename: string,
  ): void {
    const timerKey = `${key}:${filename}`

    const existing = this.debounceTimers.get(timerKey)
    if (existing) clearTimeout(existing)

    this.debounceTimers.set(
      timerKey,
      setTimeout(() => {
        this.debounceTimers.delete(timerKey)
        emitToProject(projectId, 'claude-config:changed', {
          scope,
          repoId: repoId ?? null,
          filename,
        })
      }, 300),
    )
  }
}

export const configWatcher = new ConfigWatcher()
