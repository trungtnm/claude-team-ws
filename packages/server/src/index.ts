import { createServer } from 'http'
import { fileURLToPath } from 'url'
import path from 'path'
import express, { type Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import { eq } from 'drizzle-orm'

import { db } from './db/index.js'
import { users } from './db/schema.js'
import { seed } from './db/seed.js'
import { setAuthUserLookup, authenticate } from './middleware/auth.js'
import { requireProjectMember } from './middleware/project-access.js'
import { globalLimiter, authLimiter } from './middleware/rate-limit.js'
import { initSocketIO, setUserLookup } from './services/socket-manager.js'
import { BeadsService } from './services/beads-service.js'
import { BvService } from './services/bv-service.js'
import { initSessionRunner, stopSessionRunner } from './services/session-runner.js'

// Routes
import healthRouter from './routes/health.js'
import { createAuthRouter } from './routes/auth.js'
import projectsRouter from './routes/projects.js'
import membersRouter from './routes/members.js'
import reposRouter from './routes/repos.js'
import { createCapturesRouter } from './routes/captures.js'
import { createEpicsRouter } from './routes/epics.js'
import sessionsRouter from './routes/sessions.js'
import { createGraphRouter } from './routes/graph.js'
import rulesRouter from './routes/rules.js'
import webhooksRouter from './routes/webhooks.js'
import notificationsRouter from './routes/notifications.js'
import reviewsRouter from './routes/reviews.js'
import mailRouter from './routes/mail.js'
import { createBeadsSyncRouter } from './routes/beads-sync.js'
import { createActivityRouter } from './routes/activity.js'

const PORT = parseInt(process.env.PORT || '3000', 10)
const PROJECT_ROOT = process.env.PROJECT_ROOT || '.'

// ─── Services ────────────────────────────────────────────────────────────────

const beadsService = new BeadsService(PROJECT_ROOT)
const bvService = new BvService(PROJECT_ROOT)

// ─── Express App ─────────────────────────────────────────────────────────────

const app: Express = express()

// Trust proxy headers (Cloudflare Tunnel) so rate limiter sees real client IPs
app.set('trust proxy', 1)

// Security & parsing middleware
app.use(helmet({
  contentSecurityPolicy: false, // Vite build uses inline scripts; CSP managed at Cloudflare edge
}))
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}))
app.use(morgan('dev'))
app.use(express.json())
app.use(cookieParser())
app.use(globalLimiter)

// ─── Seed database ───────────────────────────────────────────────────────────

seed()

// ─── User lookup (shared by auth middleware + socket.io) ─────────────────────

async function lookupUser(criteria: { apiKey?: string; userId?: string }) {
  const { apiKey, userId } = criteria
  if (apiKey) {
    const row = db.select().from(users).where(eq(users.api_key, apiKey)).get()
    if (row) return { id: row.id, name: row.name, role: row.role }
  } else if (userId) {
    const row = db.select().from(users).where(eq(users.id, userId)).get()
    if (row) return { id: row.id, name: row.name, role: row.role }
  }
  return null
}

setAuthUserLookup(lookupUser)
setUserLookup(lookupUser)

// ─── Routes ──────────────────────────────────────────────────────────────────

// Public routes (no auth)
app.use('/api/health', healthRouter)
app.use('/api/auth', authLimiter, createAuthRouter({ db, users }))

// Protected routes
app.use('/api/projects', authenticate, projectsRouter)
app.use('/api/projects/:projectId/members', authenticate, requireProjectMember, membersRouter)
app.use('/api/projects/:projectId/repos', authenticate, requireProjectMember, reposRouter)
app.use('/api/projects/:projectId/captures', authenticate, requireProjectMember, createCapturesRouter({ db, beadsService }))
app.use('/api/projects/:projectId/epics', authenticate, requireProjectMember, createEpicsRouter({ db, beadsService }))
app.use('/api/projects/:projectId/sessions', authenticate, requireProjectMember, sessionsRouter)
app.use('/api/projects/:projectId/graph', authenticate, requireProjectMember, createGraphRouter({ bvService }))
app.use('/api/projects/:projectId/rules', authenticate, requireProjectMember, rulesRouter)
app.use('/api/projects/:projectId/webhooks', authenticate, requireProjectMember, webhooksRouter)
app.use('/api/projects/:projectId/reviews', authenticate, requireProjectMember, reviewsRouter)
app.use('/api/projects/:projectId/mail', authenticate, requireProjectMember, mailRouter)
app.use('/api/projects/:projectId/beads-sync', authenticate, requireProjectMember, createBeadsSyncRouter({ beadsService, projectRoot: PROJECT_ROOT }))
app.use('/api/projects/:projectId/activity', authenticate, requireProjectMember, createActivityRouter({ db }))

// User-scoped routes (no project context)
app.use('/api/notifications', authenticate, notificationsRouter)

// ─── Global Error Handler ────────────────────────────────────────────────────

// Catch-all for unhandled route errors — MUST be registered after all routes
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[ERROR]', err.stack || err.message)
  const status = (err as unknown as { status?: number }).status ?? 500
  res.status(status).json({
    error: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  })
})

// ─── Static File Serving (production) ────────────────────────────────────────

// Serve the Vite-built client in production (or when the dist exists).
// In dev, Vite dev server handles this via proxy.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const clientDist = path.resolve(__dirname, '../../../client/dist')

app.use(express.static(clientDist))

// SPA fallback — any non-API route serves index.html so client-side routing works
app.get('*', (_req, res, next) => {
  // Don't intercept API or socket.io routes
  if (_req.path.startsWith('/api') || _req.path.startsWith('/socket.io')) {
    next()
    return
  }
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next() // If dist doesn't exist (dev mode), just skip
  })
})

// ─── HTTP Server + Socket.IO ─────────────────────────────────────────────────

const httpServer = createServer(app)
initSocketIO(httpServer)

// Start session runner after Socket.IO is initialized
initSessionRunner(PROJECT_ROOT)

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received — shutting down gracefully')
  stopSessionRunner()
  httpServer.close()
})

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received — shutting down gracefully')
  stopSessionRunner()
  httpServer.close()
})

httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})

export { app, httpServer }
