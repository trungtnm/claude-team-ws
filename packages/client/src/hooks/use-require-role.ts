import { useAuth } from '@/providers/auth-provider'
import type { UserRole } from '@/types'

export function useRequireRole(...allowedRoles: UserRole[]): {
  hasAccess: boolean
  role: UserRole | undefined
} {
  const { user } = useAuth()
  const role = user?.role as UserRole | undefined
  const hasAccess = role !== undefined && allowedRoles.includes(role)
  return { hasAccess, role }
}
