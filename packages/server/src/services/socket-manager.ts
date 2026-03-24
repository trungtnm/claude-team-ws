import type { Server as HttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import jwt from 'jsonwebtoken'
import { eq, and } from 'drizzle-orm'
import { getJwtSecret } from '../middleware/auth.js'
import { db } from '../db/index.js'
import { projectMembers, sessions } from '../db/schema.js'

/** Parse a single cookie value from a raw Cookie header */
function parseCookie(header: string, name: string): string | undefined {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1]
}

let io: SocketIOServer | null = null

/** User lookup function type — injected to avoid hard DB dependency at init */
type UserLookup = (criteria: { apiKey?: string; userId?: string }) => Promise<{ id: string; name: string; role: string } | null>

let lookupUser: UserLookup = async () => null

/** Set the user lookup function (called from index.ts after DB is ready) */
export function setUserLookup(fn: UserLookup): void {
  lookupUser = fn
}

/**
 * Initialize Socket.IO server with auth and room management.
 *
 * Rooms:
 * - project:<projectId> — board updates, epic/capture changes, session lifecycle
 * - session:<sessionId> — real-time agent output, AskUserQuestion
 * - user:<userId>       — personal notifications
 */
export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? false
        : ['http://localhost:5173', 'http://localhost:5174'],
      credentials: true,
    },
  })

  // Auth middleware — verify API key, auth token, or session cookie
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined

      // 1. Try explicit auth token (API key or JWT passed from client)
      if (token) {
        // Try as API key
        const userByKey = await lookupUser({ apiKey: token })
        if (userByKey) {
          socket.data.user = userByKey
          return next()
        }

        // Try as JWT
        try {
          const payload = jwt.verify(token, getJwtSecret()) as { userId: string }
          const userByJwt = await lookupUser({ userId: payload.userId })
          if (userByJwt) {
            socket.data.user = userByJwt
            return next()
          }
        } catch {
          // JWT verify failed, fall through to cookie
        }
      }

      // 2. Try session cookie from handshake headers (httpOnly cookies are sent automatically)
      const cookieHeader = socket.handshake.headers.cookie
      if (cookieHeader) {
        const sessionToken = parseCookie(cookieHeader, 'ctw_session')
        if (sessionToken) {
          try {
            const payload = jwt.verify(sessionToken, getJwtSecret()) as { userId: string }
            const userByCookie = await lookupUser({ userId: payload.userId })
            if (userByCookie) {
              socket.data.user = userByCookie
              return next()
            }
          } catch {
            // Cookie JWT invalid
          }
        }
      }

      return next(new Error('Authentication required'))
    } catch {
      return next(new Error('Authentication failed'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.data.user as { id: string; name: string; role: string }

    // Auto-join user's personal notification room
    socket.join(`user:${user.id}`)

    // Client requests to join a project room — verify membership
    socket.on('join:project', ({ projectId }: { projectId: string }) => {
      const membership = db.select()
        .from(projectMembers)
        .where(and(eq(projectMembers.project_id, projectId), eq(projectMembers.user_id, user.id)))
        .get()
      if (membership) {
        socket.join(`project:${projectId}`)
      } else {
        socket.emit('error', { message: 'Not a member of this project' })
      }
    })

    // Client requests to join a session room — verify session belongs to user's project
    socket.on('join:session', ({ sessionId }: { sessionId: string }) => {
      const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (!session) {
        socket.emit('error', { message: 'Session not found' })
        return
      }
      const membership = db.select()
        .from(projectMembers)
        .where(and(eq(projectMembers.project_id, session.project_id), eq(projectMembers.user_id, user.id)))
        .get()
      if (membership) {
        socket.join(`session:${sessionId}`)
      } else {
        socket.emit('error', { message: 'Not authorized to view this session' })
      }
    })

    // Client requests to leave a session room
    socket.on('leave:session', ({ sessionId }: { sessionId: string }) => {
      socket.leave(`session:${sessionId}`)
    })

    socket.on('disconnect', () => {
      // Rooms are auto-cleaned by Socket.IO on disconnect
    })
  })

  return io
}

/** Get the Socket.IO server instance. Throws if not initialized. */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized — call initSocketIO() first')
  }
  return io
}

/** Emit event to all clients in a project room. */
export function emitToProject(projectId: string, event: string, data: unknown): void {
  getIO().to(`project:${projectId}`).emit(event, data)
}

/** Emit event to all clients in a session room. */
export function emitToSession(sessionId: string, event: string, data: unknown): void {
  getIO().to(`session:${sessionId}`).emit(event, data)
}

/** Emit event to a specific user's notification room. */
export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data)
}
