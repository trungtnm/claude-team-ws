import { createServer } from 'http'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { initSocketIO, setUserLookup } from './services/socket-manager.js'
import { eq } from 'drizzle-orm'
import { db } from './db/index.js'
import * as schema from './db/schema.js'
import { seed } from './db/seed.js'
import { BeadsService } from './services/beads-service.js'
import { BvService } from './services/bv-service.js'
import { requireProjectMember } from './middleware/project-access.js'

// Route imports — default exports
import healthRouter from './routes/health.js'
import projectsRouter from './routes/projects.js'
import reposRouter from './routes/repos.js'
import sessionsRouter from './routes/sessions.js'
import notificationsRouter from './routes/notifications.js'
import mailRouter from './routes/mail.js'
import rulesRouter from './routes/rules.js'
import webhooksRouter from './routes/webhooks.js'
import reviewsRouter from './routes/reviews.js'
import membersRouter from './routes/members.js'

// Route imports — factory functions
import { createAuthRouter } from './routes/auth.js'
import { createCapturesRouter } from './routes/captures.js'
import { createEpicsRouter } from './routes/epics.js'
import { createGraphRouter } from './routes/graph.js'
import { createBeadsSyncRouter } from './routes/beads-sync.js'

const PORT = parseInt(process.env.PORT || '3000', 10)
const PROJECT_ROOT = process.env.PROJECT_ROOT || '.'

// Services
const beadsService = new BeadsService(PROJECT_ROOT)
const bvService = new BvService(PROJECT_ROOT)

const app: ReturnType<typeof express> = express()

// Security & parsing middleware
app.use(helmet())
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? false
    : ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}))
app.use(morgan('dev'))
app.use(express.json())
app.use(cookieParser())

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
})
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts, please try again later' },
})
app.use('/api', apiLimiter)
app.use('/api/auth/login', authLimiter)

// Seed default data on first boot
seed()

// Wire Socket.IO user lookup to the database
setUserLookup(async (criteria) => {
  const { apiKey, userId } = criteria
  if (apiKey) {
    const row = db.select().from(schema.users).where(eq(schema.users.api_key, apiKey)).get()
    if (row) return { id: row.id, name: row.name, role: row.role }
  } else if (userId) {
    const row = db.select().from(schema.users).where(eq(schema.users.id, userId)).get()
    if (row) return { id: row.id, name: row.name, role: row.role }
  }
  return null
})

// ── Public routes (no auth) ────────────────────────────
app.use('/api/health', healthRouter)
app.use('/api/auth', createAuthRouter({ db, users: schema.users }))

// ── Authenticated routes ───────────────────────────────
app.use('/api/projects', projectsRouter)

// ── Project-scoped routes (require membership) ────────
app.use('/api/projects/:projectId/members', requireProjectMember, membersRouter)
app.use('/api/projects/:projectId/repos', requireProjectMember, reposRouter)
app.use('/api/projects/:projectId/captures', requireProjectMember, createCapturesRouter({ db, beadsService }))
app.use('/api/projects/:projectId/epics', requireProjectMember, createEpicsRouter({ db, beadsService }))
app.use('/api/projects/:projectId/sessions', requireProjectMember, sessionsRouter)
app.use('/api/projects/:projectId/graph', requireProjectMember, createGraphRouter({ bvService }))
app.use('/api/projects/:projectId/rules', requireProjectMember, rulesRouter)
app.use('/api/projects/:projectId/webhooks', requireProjectMember, webhooksRouter)
app.use('/api/projects/:projectId/mail', requireProjectMember, mailRouter)
app.use('/api/projects/:projectId/reviews', requireProjectMember, reviewsRouter)
app.use('/api/projects/:projectId/beads-sync', requireProjectMember, createBeadsSyncRouter({ beadsService, projectRoot: PROJECT_ROOT }))
app.use('/api/notifications', notificationsRouter)

// Create HTTP server and attach Socket.IO
const httpServer = createServer(app)
initSocketIO(httpServer)

// Start
httpServer.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`)
})

export { app, httpServer }
