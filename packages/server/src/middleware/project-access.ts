import type { Request, Response, NextFunction } from 'express'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projects, projectMembers } from '../db/schema.js'

export function requireProjectMember(req: Request, res: Response, next: NextFunction): void {
  const user = req.user as { id: string } | undefined
  if (!user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const rawProjectId = req.params.projectId
  if (!rawProjectId) {
    res.status(400).json({ error: 'Project ID required' })
    return
  }
  const projectId = Array.isArray(rawProjectId) ? rawProjectId[0] : rawProjectId

  // Look up by ID first, then by slug
  let project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    project = db.select().from(projects).where(eq(projects.slug, projectId)).get()
  }
  if (!project) {
    res.status(404).json({ error: 'Project not found' })
    return
  }

  // Normalize projectId to actual ID (in case slug was used)
  req.params.projectId = project.id

  // Check membership
  const membership = db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.project_id, project.id),
        eq(projectMembers.user_id, user.id),
      ),
    )
    .get()

  if (!membership) {
    res.status(403).json({ error: 'Not a member of this project' })
    return
  }

  next()
}
