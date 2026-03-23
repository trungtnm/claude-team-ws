import { io, type Socket } from 'socket.io-client'

// ---------------------------------------------------------------------------
// Socket.IO client — connects to the server with auth
// ---------------------------------------------------------------------------

function createSocket(): Socket {
  const token = localStorage.getItem('auth_token')

  return io({
    autoConnect: false,
    auth: token ? { token } : undefined,
    transports: ['websocket', 'polling'],
  })
}

export const socket: Socket = createSocket()

// ---------------------------------------------------------------------------
// Room helpers
// ---------------------------------------------------------------------------

export function joinRoom(room: string): void {
  socket.emit('join', room)
}

export function leaveRoom(room: string): void {
  socket.emit('leave', room)
}

// ---------------------------------------------------------------------------
// Connection lifecycle
// ---------------------------------------------------------------------------

export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect()
  }
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect()
  }
}
