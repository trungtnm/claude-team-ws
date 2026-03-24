import { Router, type Router as RouterType } from 'express'
import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { mkdirSync, existsSync, writeFileSync } from 'fs'
import { join } from 'path'
import slugify from 'slug'
import { authenticate } from '../middleware/auth.js'
import { requireRole } from '../middleware/rbac.js'
import { db } from '../db/index.js'
import { projects, repos, projectMembers } from '../db/schema.js'
import { emitToProject } from '../services/socket-manager.js'

const execFileAsync = promisify(execFile)
const router: RouterType = Router()
router.use(authenticate)

// ── GET /api/projects ────────────────────────────────────
// List projects the user has access to

router.get('/', async (req, res) => {
  try {
    const user = req.user!

    // Get projects where the user is a member
    const memberRows = db
      .select({ project_id: projectMembers.project_id })
      .from(projectMembers)
      .where(eq(projectMembers.user_id, user.id))
      .all()

    const memberProjectIds = new Set(memberRows.map((r) => r.project_id))

    // TechLead and PM can see all projects
    const allProjects = (user.role === 'techlead' || user.role === 'pm')
      ? db.select().from(projects).all()
      : db.select().from(projects).all().filter((p) => memberProjectIds.has(p.id))

    // Attach repos for each project
    const result = allProjects.map((p) => {
      const projectRepos = db
        .select()
        .from(repos)
        .where(eq(repos.project_id, p.id))
        .all()

      return { ...p, repos: projectRepos }
    })

    res.json({ projects: result })
  } catch (err) {
    res.status(500).json({ error: `Failed to list projects: ${(err as Error).message}` })
  }
})

// ── POST /api/projects ───────────────────────────────────
// Create a new project (PM or TechLead)

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).optional(),
})

router.post('/', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const parsed = createProjectSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid data', details: parsed.error.issues })
      return
    }

    const { name } = parsed.data
    const projectSlug = parsed.data.slug ?? slugify(name, { lower: true })
    const projectRoot = join(process.env.PROJECT_ROOT || '/data/projects', projectSlug)
    const id = nanoid()

    // Check for duplicate slug
    const existing = db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, projectSlug))
      .all()

    if (existing.length > 0) {
      res.status(409).json({ error: `Project with slug '${projectSlug}' already exists` })
      return
    }

    // Auto-initialize project directory structure
    if (!existsSync(projectRoot)) {
      mkdirSync(projectRoot, { recursive: true })
    }

    // Initialize git repo if not already a repo
    const gitDir = join(projectRoot, '.git')
    if (!existsSync(gitDir)) {
      await execFileAsync('git', ['init'], { cwd: projectRoot })

      // Create .gitignore
      const gitignoreContent = [
        'beads.db',
        '.ccu/',
        'data/',
        'node_modules/',
        '.DS_Store',
        '',
      ].join('\n')
      writeFileSync(join(projectRoot, '.gitignore'), gitignoreContent)

      // Initialize beads
      try {
        await execFileAsync('br', ['init'], { cwd: projectRoot })
      } catch {
        // br init may fail if already initialized, that's ok
      }

      // Create repos directory
      const reposDir = join(projectRoot, 'repos')
      if (!existsSync(reposDir)) {
        mkdirSync(reposDir)
      }

      // Initial commit
      await execFileAsync('git', ['add', '.'], { cwd: projectRoot })
      await execFileAsync('git', ['commit', '-m', 'Init project'], { cwd: projectRoot })
    }

    // Insert into DB
    const now = Math.floor(Date.now() / 1000)
    db.insert(projects).values({
      id,
      name,
      slug: projectSlug,
      project_root: projectRoot,
      max_concurrent_agents: 3,
      ask_question_mode: 'hybrid',
      created_at: now,
      updated_at: now,
    }).run()

    // Add creator as a project member
    db.insert(projectMembers).values({
      project_id: id,
      user_id: req.user!.id,
      role_override: null,
      created_at: now,
    }).run()

    const project = db
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .get()

    res.status(201).json({ project: { ...project, repos: [] } })
  } catch (err) {
    res.status(500).json({ error: `Failed to create project: ${(err as Error).message}` })
  }
})

// ── GET /api/projects/:projectId ─────────────────────────
// Project details + stats + repos

router.get('/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>

    // Support lookup by ID or slug
    let project = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    if (!project) {
      project = db
        .select()
        .from(projects)
        .where(eq(projects.slug, projectId))
        .get()
    }

    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return
    }

    const projectRepos = db
      .select()
      .from(repos)
      .where(eq(repos.project_id, projectId))
      .all()

    const members = db
      .select()
      .from(projectMembers)
      .where(eq(projectMembers.project_id, projectId))
      .all()

    res.json({
      project: {
        ...project,
        repos: projectRepos,
        members_count: members.length,
      },
    })
  } catch (err) {
    res.status(500).json({ error: `Failed to get project: ${(err as Error).message}` })
  }
})

// ── PATCH /api/projects/:projectId ───────────────────────
// Update project settings

const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  max_concurrent_agents: z.number().int().min(1).max(10).optional(),
  ask_question_mode: z.enum(['pause', 'auto', 'hybrid']).optional(),
})

router.patch('/:projectId', requireRole('pm', 'techlead'), async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>
    const parsed = updateProjectSchema.safeParse(req.body)
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

    const updates: Record<string, unknown> = {
      updated_at: Math.floor(Date.now() / 1000),
    }

    if (parsed.data.name !== undefined) updates.name = parsed.data.name
    if (parsed.data.max_concurrent_agents !== undefined) updates.max_concurrent_agents = parsed.data.max_concurrent_agents
    if (parsed.data.ask_question_mode !== undefined) updates.ask_question_mode = parsed.data.ask_question_mode

    db.update(projects)
      .set(updates)
      .where(eq(projects.id, projectId))
      .run()

    const updated = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get()

    res.json({ project: updated })
  } catch (err) {
    res.status(500).json({ error: `Failed to update project: ${(err as Error).message}` })
  }
})

export default router
