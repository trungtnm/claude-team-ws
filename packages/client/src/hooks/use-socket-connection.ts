import { useEffect } from 'react'
import { connectSocket, disconnectSocket, joinProject } from '@/lib/socket'
import { useAuth } from '@/providers/auth-provider'
import { useProject } from '@/providers/project-provider'

export function useSocketConnection(): void {
  const { isAuthenticated } = useAuth()
  const { projectId } = useProject()

  useEffect(() => {
    if (!isAuthenticated) return

    // Connect with API key or JWT
    const token = localStorage.getItem('auth_token') ?? ''
    connectSocket(token)

    return () => {
      disconnectSocket()
    }
  }, [isAuthenticated])

  // Join project room when project changes
  useEffect(() => {
    if (!isAuthenticated || !projectId) return
    joinProject(projectId)
  }, [isAuthenticated, projectId])
}
