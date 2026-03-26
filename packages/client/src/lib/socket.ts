import { io, type Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 30_000,
    })
  }
  return socket
}

export function connectSocket(token: string): void {
  const s = getSocket()
  s.auth = { token }
  if (!s.connected) {
    s.connect()
  }
}

export function disconnectSocket(): void {
  if (socket?.connected) {
    socket.disconnect()
  }
}

// Room management
export function joinProject(projectId: string): void {
  getSocket().emit('join:project', { projectId })
}

export function joinSession(sessionId: string): void {
  getSocket().emit('join:session', { sessionId })
}

export function leaveSession(sessionId: string): void {
  getSocket().emit('leave:session', { sessionId })
}
