import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

/** Connect with auth token (API key or JWT) */
export function connectSocket(token?: string): void {
  const s = getSocket()
  if (token) {
    s.auth = { token }
  }
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}

/** Join a project room — subscribes to board updates, epic/capture changes */
export function joinProjectRoom(projectId: string): void {
  getSocket().emit('join:project', { projectId })
}

/** Leave a project room */
export function leaveProjectRoom(projectId: string): void {
  getSocket().emit('leave:project', { projectId })
}

/** Join a session room — subscribes to agent stream, Q&A events */
export function joinSessionRoom(sessionId: string): void {
  getSocket().emit('join:session', { sessionId })
}

/** Leave a session room */
export function leaveSessionRoom(sessionId: string): void {
  getSocket().emit('leave:session', { sessionId })
}

// Legacy aliases for backward compatibility with useSocketRoom
export function joinRoom(room: string): void {
  const s = getSocket()
  if (room.startsWith('project:')) {
    s.emit('join:project', { projectId: room.replace('project:', '') })
  } else if (room.startsWith('session:')) {
    s.emit('join:session', { sessionId: room.replace('session:', '') })
  }
}

export function leaveRoom(room: string): void {
  const s = getSocket()
  if (room.startsWith('project:')) {
    s.emit('leave:project', { projectId: room.replace('project:', '') })
  } else if (room.startsWith('session:')) {
    s.emit('leave:session', { sessionId: room.replace('session:', '') })
  }
}
