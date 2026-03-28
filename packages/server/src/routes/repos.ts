import { Router, type Router as RouterType, type Request } from 'express'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { db } from '../db/index.js'
import { repos } from '../db/schema.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { emitToProject } from '../services/socket-manager.js'
import { GitService } from '../services/git-service.js'
import { logError } from '../utils/log-error.js'

// Mounted at /api/projects/:projectId/repos
const router: RouterType = Router({ mergeParams: true })

router.use(authenticate)
router.use(requireProjectMember)

const gitService = new GitService(process.cwd())

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

// GET / — list repos for project
router.get('/', (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const rows = db.select().from(repos).where(eq(repos.project_id, projectId)).all()
    res.json({ repos: rows })
  } catch (err) {
      res.status(500).json({ error: logError('repos', err) })
  }
})

/** Validate git URL to prevent SSRF — only HTTPS on allowed hosts */
function isAllowedGitUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Must be HTTPS (block file://, http://, ssh://, etc.)
    if (parsed.protocol !== 'https:') return false
    // Block private/internal IPs
    const hostname = parsed.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return false
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return false
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false
    if (hostname === '169.254.169.254') return false // Cloud metadata
    return true
  } catch {
    return false
  }
}

const addRepoSchema = z.object({
  name: z.string().min(1).max(200),
  git_url: z.string().url().refine(isAllowedGitUrl, { message: 'git_url must be HTTPS and not target internal/private addresses' }).optional(),
  source_path: z.string().min(1).optional(),
  default_branch: z.string().min(1).optional(),
  mode: z.enum(['clone', 'link']).optional(),
})

// POST / — add repo (PM/TechLead)
router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const parsed = addRepoSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
      return
    }

    const projectId = param(req, 'projectId')
    const user = req.user!
    const { name, git_url, source_path, default_branch, mode: requestMode } = parsed.data

    // Check uniqueness within project
    const existing = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, name)))
      .get()

    if (existing) {
      res.status(409).json({ error: 'Repo name already exists in this project' })
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const id = `repo_${nanoid(12)}`
    const linkMode = requestMode === 'link' ? 'symlink' : 'clone'
    const repoPath = source_path ?? name
    const status = linkMode === 'clone' && git_url ? 'cloning' : 'ready'

    db.insert(repos).values({
      id,
      project_id: projectId,
      name,
      git_url: git_url ?? null,
      path: repoPath,
      default_branch: default_branch ?? 'main',
      link_mode: linkMode,
      status,
      added_by: user.id,
      created_at: now,
    }).run()

    const repo = db.select().from(repos).where(eq(repos.id, id)).get()

    // If clone mode with git_url, start cloning in background
    if (requestMode === 'clone' && git_url) {
      gitService.clone(git_url, repoPath, default_branch).then(() => {
        db.update(repos).set({ status: 'ready' }).where(eq(repos.id, id)).run()
        emitToProject(projectId, 'repo:updated', { ...repo, status: 'ready' })
      }).catch((cloneErr) => {
        const errMsg = cloneErr instanceof Error ? cloneErr.message : 'Clone failed'
        db.update(repos).set({ status: 'error' }).where(eq(repos.id, id)).run()
        emitToProject(projectId, 'repo:updated', { ...repo, status: 'error', error: errMsg })
      })
    }

    emitToProject(projectId, 'repo:created', repo)
    res.status(201).json({ repo })
  } catch (err) {
      res.status(500).json({ error: logError('repos', err) })
  }
})

// GET /:repoName/branches — list branches
router.get('/:repoName/branches', async (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const repoName = param(req, 'repoName')
    const repo = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .get()

    if (!repo) {
      res.status(404).json({ error: 'Repo not found' })
      return
    }

    const branches = await gitService.branches(repo.path)
    res.json({ branches })
  } catch (err) {
      res.status(500).json({ error: logError('repos', err) })
  }
})

// POST /:repoName/pull — pull latest
router.post('/:repoName/pull', async (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const repoName = param(req, 'repoName')
    const repo = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .get()

    if (!repo) {
      res.status(404).json({ error: 'Repo not found' })
      return
    }

    if (repo.status !== 'ready') {
      res.status(400).json({ error: `Repo is not ready (status: ${repo.status})` })
      return
    }

    const result = await gitService.pull(repo.path)
    emitToProject(projectId, 'repo:pulled', { repo_id: repo.id, name: repo.name, ...result })
    res.json(result)
  } catch (err) {
      res.status(500).json({ error: logError('repos', err) })
  }
})

// DELETE /:repoName — remove repo
router.delete('/:repoName', requireRole('pm', 'techlead'), (req, res) => {
  try {
    const projectId = param(req, 'projectId')
    const repoName = param(req, 'repoName')
    const repo = db
      .select()
      .from(repos)
      .where(and(eq(repos.project_id, projectId), eq(repos.name, repoName)))
      .get()

    if (!repo) {
      res.status(404).json({ error: 'Repo not found' })
      return
    }

    db.delete(repos).where(eq(repos.id, repo.id)).run()
    emitToProject(projectId, 'repo:removed', { repo_id: repo.id, name: repoName })
    res.status(204).send()
  } catch (err) {
      res.status(500).json({ error: logError('repos', err) })
  }
})

export default router
