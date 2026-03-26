export interface User {
  id: string
  name: string
  email: string
  role: 'pm' | 'dev' | 'techlead' | 'viewer'
  avatarUrl?: string
  initials: string
  color: string
}

export const users: User[] = [
  { id: 'u-1', name: 'Trung Tran', email: 'trung@team.dev', role: 'techlead', initials: 'TT', color: '#f59e0b' },
  { id: 'u-2', name: 'Minh Le', email: 'minh@team.dev', role: 'pm', initials: 'ML', color: '#3b82f6' },
  { id: 'u-3', name: 'Hoa Nguyen', email: 'hoa@team.dev', role: 'dev', initials: 'HN', color: '#22c55e' },
  { id: 'u-4', name: 'Duc Pham', email: 'duc@team.dev', role: 'dev', initials: 'DP', color: '#a855f7' },
  { id: 'u-5', name: 'Lan Vo', email: 'lan@team.dev', role: 'viewer', initials: 'LV', color: '#ec4899' },
]

export const currentUser = users[0]

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export const roleLabels: Record<string, string> = {
  pm: 'PM',
  dev: 'Developer',
  techlead: 'Tech Lead',
  viewer: 'Viewer',
}

export const roleColors: Record<string, string> = {
  pm: 'text-blue-400 bg-blue-400/10',
  dev: 'text-green-400 bg-green-400/10',
  techlead: 'text-amber-400 bg-amber-400/10',
  viewer: 'text-gray-400 bg-gray-400/10',
}
