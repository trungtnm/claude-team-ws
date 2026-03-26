import type { Server as HttpServer } from 'http'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { projectMembers, sessions } from '../db/schema.js'
import { getJwtSecret } from '../middleware/auth.js'

let io: SocketIOServer | null = null

// User lookup function — set by the main server
type UserLookup = (params: { apiKey?: string; userId?: string }) => Promise<Record<string, unknown> | null>
let lookupUser: UserLookup = async () => null

export function setUserLookup(fn: UserLookup): void {
  lookupUser = fn
}

function parseCookie(header: string, name: string): string | undefined {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
  return match?.[1]
}

export function initSocketIO(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production'
        ? false
        : ['http://localhost:5173', 'http://localhost:5174'],
      credentials: true,
    },
  })

  // Authentication middleware
  io.use(async (socket: Socket, next) => {
    try {
      // Try token from auth payload
      const token = socket.handshake.auth?.token as string | undefined
      if (token) {
        // Try as API key first
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
          // Not a valid JWT, continue
        }
      }

      // Try cookie
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
            // Invalid cookie
          }
        }
      }

      return next(new Error('Authentication required'))
    } catch {
      return next(new Error('Authentication failed'))
    }
  })

  // Connection handler
  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as { id: string }

    // Auto-join user room
    socket.join(`user:${user.id}`)

    // Join project room (with membership check)
    socket.on('join:project', ({ projectId }: { projectId: string }) => {
      const membership = db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.project_id, projectId),
            eq(projectMembers.user_id, user.id),
          ),
        )
        .get()

      if (membership) {
        socket.join(`project:${projectId}`)
      } else {
        socket.emit('error', { message: 'Not a member of this project' })
      }
    })

    // Join session room (with auth check)
    socket.on('join:session', ({ sessionId }: { sessionId: string }) => {
      const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
      if (!session) {
        socket.emit('error', { message: 'Session not found' })
        return
      }

      const membership = db
        .select()
        .from(projectMembers)
        .where(
          and(
            eq(projectMembers.project_id, session.project_id),
            eq(projectMembers.user_id, user.id),
          ),
        )
        .get()

      if (membership) {
        socket.join(`session:${sessionId}`)
      } else {
        socket.emit('error', { message: 'Not authorized to view this session' })
      }
    })

    // Leave session room
    socket.on('leave:session', ({ sessionId }: { sessionId: string }) => {
      socket.leave(`session:${sessionId}`)
    })
  })

  return io
}

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized — call initSocketIO() first')
  }
  return io
}

export function emitToProject(projectId: string, event: string, data: unknown): void {
  getIO().to(`project:${projectId}`).emit(event, data)
}

export function emitToSession(sessionId: string, event: string, data: unknown): void {
  getIO().to(`session:${sessionId}`).emit(event, data)
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data)
}
