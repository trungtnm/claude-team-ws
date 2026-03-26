/** Generate initials from a user name */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

/** Generate a deterministic color from a user ID */
export function getUserColor(userId: string): string {
  const colors = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#06b6d4', '#ef4444']
  let hash = 0
  for (const ch of userId) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
  return colors[Math.abs(hash) % colors.length]
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
