import { useEffect, useRef } from 'react'
import { getSocket } from '@/lib/socket'

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
