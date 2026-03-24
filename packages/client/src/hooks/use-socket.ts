import { useEffect, useRef } from 'react'
import { getSocket, connectSocket, joinRoom, leaveRoom } from '@/lib/socket'

export function useSocketRoom(room: string | undefined): void {
  useEffect(() => {
    if (!room) return

    connectSocket()
    joinRoom(room)

    return () => {
      leaveRoom(room)
    }
  }, [room])
}

export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void,
): void {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    const socket = getSocket()
    const listener = (data: T) => handlerRef.current(data)
    socket.on(event, listener)

    return () => {
      socket.off(event, listener)
    }
  }, [event])
}
