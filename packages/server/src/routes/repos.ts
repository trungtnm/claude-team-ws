import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { existsSync, symlinkSync, unlinkSync, lstatSync } from 'fs'
import { join } from 'path'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { repos, projects, sessions } from '../db/schema.js'
import { gitService } from '../services/git-service.js'
import { emitToProject } from '../services/socket-manager.js'

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

// ── GET /api/projects/:projectId/repos ───────────────────
// List repos with git status info

router.get('/', async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>

    const repoRows = db
      .select()
      .from(repos)
      .where(eq(repos.project_id, projectId))
      .all()

    const result = await Promise.all(repoRows.map(async (repo) => {
      let currentBranch = repo.default_branch
      let status = 'unknown'
      let lastCommit = { hash: '', message: '', date: '' }

      if (existsSync(repo.path)) {
        try {
          currentBranch = await gitService.currentBranch(repo.path)
          status = await gitService.status(repo.path)
          lastCommit = await gitService.lastCommit(repo.path)
        } catch {
          status = 'error'
        }
      }

      return {
        ...repo,
        current_branch: currentBranch,
        status,
        last_commit: lastCommit,
      }
    }))

    res.json({ repos: result })
  } catch (err) {
    res.status(500).json({ error: `Failed to list repos: ${(err as Error).message}` })
  }
})

// ── POST /api/projects/:projectId/repos ──────────────────
// Add a repo (clone or link mode)

const addRepoSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('clone'),
    name: z.string().min(1).max(100),
    git_url: z.string().min(1),
    default_branch: z.string().default('main'),
  }),
  z.object({
    mode: z.literal('link'),
    name: z.string().min(1).max(100),
    source_path: z.string().min(1),
    default_branch: z.string().default('main'),
  }),
])

router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>
    const parsed = addRepoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
      return
    }

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const repoName = parsed.data.name
    const repoPath = join(project.project_root, 'repos', repoName)

    // Check for existing repo with same name
    const existing = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .all()

    if (existing.length > 0) {
      res.status(409).json({ error: `Repo '${repoName}' already exists in this project` })
      return
    }

    if (existsSync(repoPath)) {
      res.status(409).json({ error: `Directory '${repoPath}' already exists` })
      return
    }

    const id = nanoid()
    const data = parsed.data

    if (data.mode === 'clone') {
      // Clone from URL
      emitToProject(projectId, 'repo:clone_progress', {
        repo_name: repoName,
        progress: 'Starting clone...',
        status: 'cloning',
      })

      try {
        await gitService.clone(data.git_url, repoPath)
      } catch (err) {
        emitToProject(projectId, 'repo:clone_progress', {
          repo_name: repoName,
          progress: '',
          status: 'error',
          error: (err as Error).message,
        })
        res.status(400).json({ error: `Clone failed: ${(err as Error).message}` })
        return
      }

      db.insert(repos).values({
        id,
        project_id: projectId,
        name: repoName,
        git_url: data.git_url,
        path: repoPath,
        default_branch: data.default_branch,
        link_mode: 'clone',
        status: 'ready',
        added_by: req.user!.id,
      }).run()
    } else {
      // Link existing repo
      const sourcePath = data.source_path

      if (!existsSync(sourcePath)) {
        res.status(400).json({ error: 'Source path does not exist' })
        return
      }

      // Block sensitive system directories (path traversal protection)
      const blocked = ['/etc', '/root', '/var', '/usr', '/bin', '/sbin', '/sys', '/proc', '/dev']
      if (blocked.some((dir) => sourcePath.startsWith(dir + '/') || sourcePath === dir)) {
        res.status(400).json({ error: 'Cannot link system directories' })
        return
      }

      const isRepo = await gitService.isGitRepo(sourcePath)
      if (!isRepo) {
        res.status(400).json({ error: 'Source path is not a git repository' })
        return
      }

      // Prevent circular references
      if (sourcePath.startsWith(project.project_root)) {
        res.status(400).json({ error: 'Source path cannot be inside the project root' })
        return
      }

      // Create symlink
      symlinkSync(sourcePath, repoPath)

      db.insert(repos).values({
        id,
        project_id: projectId,
        name: repoName,
        git_url: null,
        path: repoPath,
        default_branch: data.default_branch,
        link_mode: 'symlink',
        status: 'ready',
        added_by: req.user!.id,
      }).run()
    }

    const repo = db.select().from(repos).where(eq(repos.id, id)).get()

    emitToProject(projectId, 'repo:added', {
      repo: {
        ...repo,
        added_by: { id: req.user!.id, name: req.user!.name },
      },
    })

    res.status(201).json({ repo })
  } catch (err) {
    res.status(500).json({ error: `Failed to add repo: ${(err as Error).message}` })
  }
})

// ── DELETE /api/projects/:projectId/repos/:repoName ──────
// Remove a repo

router.delete('/:repoName', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const { projectId, repoName } = req.params as Record<string, string>

    if (!req.body?.confirm) {
      res.status(400).json({ error: 'Confirmation required: { "confirm": true }' })
      return
    }

    const repo = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .get()

    if (!repo) {
      res.status(404).json({ error: 'Repo not found' })
      return
    }

    // Check for active sessions on this repo
    const activeSessions = db
      .select()
      .from(sessions)
      .where(and(
        eq(sessions.project_id, projectId),
        eq(sessions.status, 'running'),
      ))
      .all()

    if (activeSessions.length > 0) {
      res.status(409).json({ error: 'Cannot remove repo while agent sessions are running' })
      return
    }

    // Remove from filesystem
    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (existsSync(repo.path) && project) {
      // Safety: verify repo path is inside the project root before deletion
      if (!repo.path.startsWith(project.project_root)) {
        res.status(400).json({ error: 'Repo path is outside project root — refusing to delete' })
        return
      }

      const stat = lstatSync(repo.path)
      if (stat.isSymbolicLink()) {
        unlinkSync(repo.path)
      } else {
        // For cloned repos, use rm -rf via execFile (no shell injection)
        const { execFile } = await import('child_process')
        const { promisify } = await import('util')
        await promisify(execFile)('rm', ['-rf', repo.path])
      }
    }

    // Remove from DB
    db.delete(repos).where(eq(repos.id, repo.id)).run()

    emitToProject(projectId, 'repo:removed', {
      repo_name: repoName,
      removed_by: { id: req.user!.id, name: req.user!.name },
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: `Failed to remove repo: ${(err as Error).message}` })
  }
})

// ── POST /api/projects/:projectId/repos/:repoName/pull ───
// Pull latest changes

router.post('/:repoName/pull', requireRole('pm', 'dev', 'techlead'), async (req, res) => {
  try {
    const { projectId, repoName } = req.params as Record<string, string>

    const repo = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .get()

    if (!repo) {
      res.status(404).json({ error: 'Repo not found' })
      return
    }

    const result = await gitService.pull(repo.path)
    res.json({ result: result.result, new_commits: result.newCommits, head: result.head })
  } catch (err) {
    res.status(500).json({ error: `Pull failed: ${(err as Error).message}` })
  }
})

// ── GET /api/projects/:projectId/repos/:repoName/branches
// List branches

router.get('/:repoName/branches', async (req, res) => {
  try {
    const { projectId, repoName } = req.params as Record<string, string>

    const repo = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .get()

    if (!repo) {
      res.status(404).json({ error: 'Repo not found' })
      return
    }

    const branches = await gitService.listBranches(repo.path)
    res.json({
      branches: branches.map((b) => ({
        name: b.name,
        is_default: b.isDefault,
        ahead: b.ahead,
        behind: b.behind,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to list branches: ${(err as Error).message}` })
  }
})

export default router
