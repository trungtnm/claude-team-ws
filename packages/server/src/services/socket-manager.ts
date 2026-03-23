import type { Server as HttpServer } from 'http'
import { Server, type Socket } from 'socket.io'
import jwt from 'jsonwebtoken'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import * as schema from '../db/schema.js'

export interface SocketEventMap {
  // Server → Client (Project Room)
  'capture:created': (data: Record<string, unknown>) => void
  'epic:created': (data: Record<string, unknown>) => void
  'epic:updated': (data: Record<string, unknown>) => void
  'session:lifecycle': (data: { sessionId: string; event: string; session: Record<string, unknown> }) => void
  'queue:updated': (data: { length: number; items: Record<string, unknown>[] }) => void
  'pr:event': (data: { prUrl: string; status: string; title: string }) => void
  'beads:changed': (data: { timestamp: number; hint: string }) => void
  'beads:sync_conflict': (data: { error: string; action_required: boolean }) => void
  'beads:sync_resolved': (data: { timestamp: number }) => void
  'repo:added': (data: Record<string, unknown>) => void
  'repo:removed': (data: { repoId: string }) => void

  // Server → Client (Session Room)
  'session:event': (data: { sessionId: string; event: Record<string, unknown> }) => void
  'session:question': (data: { sessionId: string; question: Record<string, unknown> }) => void
  'session:question:answered': (data: { sessionId: string; answeredBy: string }) => void
  'session:progress': (data: { sessionId: string; summary: Record<string, unknown> }) => void

  // Server → Client (User Room)
  'notification': (data: Record<string, unknown>) => void

  // Client → Server
  'join:project': (projectId: string) => void
  'join:session': (sessionId: string) => void
  'leave:session': (sessionId: string) => void
  'session:answer': (data: { sessionId: string; answer: string }) => void
  'session:cancel': (data: { sessionId: string }) => void
  'capture:create': (data: { projectId: string; text: string }) => void
}

let io: Server | null = null

export function initSocketIO(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:5173'],
      credentials: true,
    },
  })

  // Auth middleware
  io.use((socket, next) => {
    const apiKey = socket.handshake.auth.apiKey as string | undefined
    const token = socket.handshake.auth.token as string | undefined

    if (apiKey) {
      const user = db
        .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.api_key, apiKey))
        .get()

      if (user) {
        socket.data.user = user
        return next()
      }
      return next(new Error('Xác thực không hợp lệ'))
    }

    if (token) {
      const jwtSecret = process.env.JWT_SECRET
      if (!jwtSecret) return next(new Error('JWT_SECRET chưa được cấu hình'))

      try {
        const payload = jwt.verify(token, jwtSecret) as { userId: string }
        const user = db
          .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role })
          .from(schema.users)
          .where(eq(schema.users.id, payload.userId))
          .get()

        if (user) {
          socket.data.user = user
          return next()
        }
      } catch {
        // JWT verification failed
      }
      return next(new Error('Xác thực không hợp lệ'))
    }

    return next(new Error('Xác thực không hợp lệ'))
  })

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user
    if (!user) return

    // Auto-join personal room
    socket.join(`user:${user.id}`)

    // Client → Server events
    socket.on('join:project', (projectId: string) => {
      socket.join(`project:${projectId}`)
    })

    socket.on('join:session', (sessionId: string) => {
      socket.join(`session:${sessionId}`)
    })

    socket.on('leave:session', (sessionId: string) => {
      socket.leave(`session:${sessionId}`)
    })

    socket.on('disconnect', () => {
      // Cleanup handled automatically by Socket.IO
    })
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.IO chưa được khởi tạo')
  return io
}

// Emit helpers for typed broadcasts
export function emitToProject(projectId: string, event: string, data: unknown): void {
  getIO().to(`project:${projectId}`).emit(event, data)
}

export function emitToSession(sessionId: string, event: string, data: unknown): void {
  getIO().to(`session:${sessionId}`).emit(event, data)
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  getIO().to(`user:${userId}`).emit(event, data)
}
