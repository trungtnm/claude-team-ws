import type { Request, Response, NextFunction } from 'express'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projectMembers, projects } from '../db/schema.js'

/**
 * Middleware that verifies the authenticated user is a member of the project
 * specified by :projectId in the route params.
 *
 * Must be used AFTER authenticate middleware (requires req.user).
 * Must be mounted on routes that have :projectId in their path.
 *
 * Sets req.projectId for downstream handlers.
 */
export function requireProjectMember(req: Request, res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const projectId = (req.params as Record<string, string>).projectId
  if (!projectId) {
    res.status(400).json({ error: 'Project ID required' })
    return
  }

  // Verify project exists — try by ID first, then by slug
  let project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    project = db.select().from(projects).where(eq(projects.slug, projectId)).get()
  }
  if (!project) {
    res.status(404).json({ error: 'Project not found' })
    return
  }

  // Store resolved project ID on res.locals (reliable across all Express versions)
  res.locals.projectId = project.id
  // Also try to mutate params (works in Express 5 for same-router handlers)
  req.params.projectId = project.id

  // Check membership (using resolved project.id, not the URL param which might be a slug)
  const membership = db.select()
    .from(projectMembers)
    .where(and(eq(projectMembers.project_id, project.id), eq(projectMembers.user_id, user.id)))
    .get()

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this project' })
    return
  }

  next()
}

/**
 * Get the resolved project ID from a request.
 * Prefers res.locals.projectId (set by requireProjectMember after slug→ID resolution)
 * Falls back to req.params.projectId.
 */
export function getProjectId(req: Request, res: Response): string {
  return (res.locals.projectId ?? (req.params as Record<string, string>).projectId) as string
}
