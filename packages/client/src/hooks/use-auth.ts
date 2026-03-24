import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface User {
  id: string
  name: string
  email: string
  role: 'pm' | 'dev' | 'techlead' | 'viewer'
  avatar_url: string | null
}

interface LoginPayload {
  api_key: string
}

interface AuthResponse {
  user: User
}

export function useAuth() {
  return useQuery<User>({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const res = await api.get<AuthResponse>('/auth/me')
      return res.user
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLogin() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: LoginPayload) =>
      api.post<AuthResponse>('/auth/login', payload),
    onSuccess: (data) => {
      queryClient.setQueryData(['auth', 'me'], data.user)
    },
  })
}

export function useLogout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear()
    },
  })
}

export function useIsAuthenticated(): boolean {
  const { data, isError } = useAuth()
  return !!data && !isError
}

export function useRequireRole(...roles: User['role'][]): boolean {
  const { data: user } = useAuth()
  if (!user) return false
  return roles.includes(user.role)
}
