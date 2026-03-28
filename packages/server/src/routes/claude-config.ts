import { Router, type Router as RouterType, type Request, type Response } from 'express'
import { eq, and } from 'drizzle-orm'
import { z } from 'zod'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as schemaTypes from '../db/schema.js'
import { repos, projects } from '../db/schema.js'
import { ClaudeConfigService, ConflictError } from '../services/claude-config-service.js'
import { authenticate, requireRole } from '../middleware/auth.js'
import { requireProjectMember } from '../middleware/project-access.js'
import { logError } from '../utils/log-error.js'

interface ClaudeConfigRouterDeps {
  db: BetterSQLite3Database<typeof schemaTypes>
}

/** Extract a single string param (Express 5 params can be string | string[]) */
function param(req: Request, name: string): string {
  const val = req.params[name]
  return Array.isArray(val) ? val[0] : val ?? ''
}

const nameSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'Must be kebab-case (a-z, 0-9, hyphens)')
const putSchema = z.object({
  content: z.string().min(1).max(500000),
  expected_mtime: z.number().optional(),
})

export function createClaudeConfigRouter({ db }: ClaudeConfigRouterDeps): RouterType {
  const router: RouterType = Router({ mergeParams: true })

  router.use(authenticate)
  router.use(requireProjectMember)

  /** Resolve the base path — project root or repo path */
  function getService(req: Request, res: Response): ClaudeConfigService | null {
    const projectId = param(req, 'projectId')
    const repoId = req.query.repo as string | undefined

    if (repoId) {
      const repo = db.select().from(repos).where(and(eq(repos.id, repoId), eq(repos.project_id, projectId))).get()
      if (!repo) {
        res.status(404).json({ error: 'Repo not found in this project' })
        return null
      }
      return new ClaudeConfigService(repo.path)
    }

    const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
    if (!project) {
      res.status(404).json({ error: 'Project not found' })
      return null
    }
    return new ClaudeConfigService(project.project_root)
  }

  /** Handle ConflictError → 409 */
  function handleError(err: unknown, res: Response, context: string): void {
    if (err instanceof ConflictError) {
      res.status(409).json({
        error: 'conflict',
        current_content: err.currentContent,
        current_mtime: err.currentMtime,
      })
      return
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Invalid config item name')) {
      res.status(400).json({ error: msg })
      return
    }
    res.status(500).json({ error: logError(context, err) })
  }

  // ── CLAUDE.md ─────────────────────────────────────────────────────────

  router.get('/claude-md', (req, res) => {
    try {
      const svc = getService(req, res)
      if (!svc) return
      const result = svc.getClaudeMd()
      if (!result) {
        res.json({ content: null, mtime: null })
        return
      }
      res.json(result)
    } catch (err) { handleError(err, res, 'claude-config/claude-md') }
  })

  router.put('/claude-md', requireRole('pm', 'techlead'), (req, res) => {
    try {
      const parsed = putSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
        return
      }
      const svc = getService(req, res)
      if (!svc) return
      svc.putClaudeMd(parsed.data.content, parsed.data.expected_mtime)
      const updated = svc.getClaudeMd()
      res.json(updated)
    } catch (err) { handleError(err, res, 'claude-config/claude-md') }
  })

  // ── Generic CRUD for skills, agents, commands, rules ──────────────────

  function createCrudRoutes(
    resourceType: 'skills' | 'agents' | 'commands' | 'rules',
    listFn: (svc: ClaudeConfigService) => unknown[],
    getFn: (svc: ClaudeConfigService, name: string) => { content: string; mtime: number } | null,
    putFn: (svc: ClaudeConfigService, name: string, content: string, expectedMtime?: number) => void,
    deleteFn: (svc: ClaudeConfigService, name: string) => void,
  ) {
    // GET /resourceType — list all
    router.get(`/${resourceType}`, async (req, res) => {
      try {
        const svc = getService(req, res)
        if (!svc) return
        res.json({ [resourceType]: listFn(svc) })
      } catch (err) { handleError(err, res, `claude-config/${resourceType}`) }
    })

    // GET /resourceType/:name — get one
    router.get(`/${resourceType}/:name`, (req, res) => {
      try {
        const name = param(req, 'name')
        const nameResult = nameSchema.safeParse(name)
        if (!nameResult.success) {
          res.status(400).json({ error: 'Invalid name — must be kebab-case' })
          return
        }
        const svc = getService(req, res)
        if (!svc) return
        const result = getFn(svc, name)
        if (!result) {
          res.status(404).json({ error: `${resourceType.slice(0, -1)} not found` })
          return
        }
        res.json(result)
      } catch (err) { handleError(err, res, `claude-config/${resourceType}`) }
    })

    // PUT /resourceType/:name — create/update
    router.put(`/${resourceType}/:name`, requireRole('pm', 'techlead'), (req, res) => {
      try {
        const name = param(req, 'name')
        const nameResult = nameSchema.safeParse(name)
        if (!nameResult.success) {
          res.status(400).json({ error: 'Invalid name — must be kebab-case' })
          return
        }
        const parsed = putSchema.safeParse(req.body)
        if (!parsed.success) {
          res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues })
          return
        }
        const svc = getService(req, res)
        if (!svc) return
        putFn(svc, name, parsed.data.content, parsed.data.expected_mtime)
        const updated = getFn(svc, name)
        res.json(updated)
      } catch (err) { handleError(err, res, `claude-config/${resourceType}`) }
    })

    // DELETE /resourceType/:name — delete
    router.delete(`/${resourceType}/:name`, requireRole('pm', 'techlead'), (req, res) => {
      try {
        const name = param(req, 'name')
        const nameResult = nameSchema.safeParse(name)
        if (!nameResult.success) {
          res.status(400).json({ error: 'Invalid name — must be kebab-case' })
          return
        }
        const svc = getService(req, res)
        if (!svc) return
        deleteFn(svc, name)
        res.status(204).send()
      } catch (err) { handleError(err, res, `claude-config/${resourceType}`) }
    })
  }

  // Register CRUD routes for each resource type
  createCrudRoutes('skills',
    (svc) => svc.listSkills(),
    (svc, name) => svc.getSkill(name),
    (svc, name, content, mtime) => svc.putSkill(name, content, mtime),
    (svc, name) => svc.deleteSkill(name),
  )

  createCrudRoutes('agents',
    (svc) => svc.listAgents(),
    (svc, name) => svc.getAgent(name),
    (svc, name, content, mtime) => svc.putAgent(name, content, mtime),
    (svc, name) => svc.deleteAgent(name),
  )

  createCrudRoutes('commands',
    (svc) => svc.listCommands(),
    (svc, name) => svc.getCommand(name),
    (svc, name, content, mtime) => svc.putCommand(name, content, mtime),
    (svc, name) => svc.deleteCommand(name),
  )

  createCrudRoutes('rules',
    (svc) => svc.listRules(),
    (svc, name) => svc.getRule(name),
    (svc, name, content, mtime) => svc.putRule(name, content, mtime),
    (svc, name) => svc.deleteRule(name),
  )

  // ── Settings (read-only) ──────────────────────────────────────────────

  router.get('/settings', (req, res) => {
    try {
      const svc = getService(req, res)
      if (!svc) return
      const settings = svc.getSettings()
      res.json({ settings })
    } catch (err) { handleError(err, res, 'claude-config/settings') }
  })

  return router
}
