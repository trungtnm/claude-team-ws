import { useEffect, useCallback } from 'react'
import { NavLink, useParams, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Inbox, Bot, GitBranch, Settings, Bell, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuth } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface NotificationsResponse {
  unread_count: number
}

export function Header() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: user } = useAuth()
  const navigate = useNavigate()

  const goToCaptures = useCallback(() => {
    if (projectId) navigate(`/projects/${projectId}/captures`)
  }, [projectId, navigate])

  // Cmd+J keyboard shortcut → navigate to captures
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        goToCaptures()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [goToCaptures])

  const { data: notifData } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => api.get<NotificationsResponse>('/notifications?unread=true&limit=1'),
    refetchInterval: 30000,
  })

  const unreadCount = notifData?.unread_count ?? 0

  if (!projectId) return null

  const navItems = [
    { to: `/projects/${projectId}/board`, label: 'Board', icon: LayoutDashboard },
    { to: `/projects/${projectId}/captures`, label: 'Captures', icon: Inbox },
    { to: `/projects/${projectId}/agents`, label: 'Agents', icon: Bot },
    { to: `/projects/${projectId}/graph`, label: 'Graph', icon: GitBranch },
    { to: `/projects/${projectId}/settings`, label: 'Settings', icon: Settings },
  ]

  return (
    <header className="h-14 border-b border-edge bg-surface-raised flex items-center px-4 gap-4 shrink-0">
      {/* Logo / Project name */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-7 h-7 rounded-md bg-accent/20 flex items-center justify-center">
          <span className="text-accent font-bold text-sm">C</span>
        </div>
        <span className="text-ink font-semibold text-sm hidden sm:inline">CTW</span>
      </div>

      {/* Navigation */}
      <nav className="flex items-center gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-elevated',
              )
            }
          >
            <Icon className="h-4 w-4" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2">
        {/* Capture shortcut */}
        <Button
          size="sm"
          className="bg-accent hover:bg-accent-hover text-surface-base text-xs gap-1"
          onClick={goToCaptures}
          aria-label="New capture (⌘J)"
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Capture</span>
          <kbd className="hidden lg:inline ml-1 text-[10px] opacity-60 bg-black/20 px-1 rounded">
            ⌘J
          </kbd>
        </Button>

        {/* Notifications */}
        <button
          className="relative p-2 rounded-md text-ink-muted hover:text-ink hover:bg-surface-elevated transition-colors"
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          onClick={() => projectId && navigate(`/projects/${projectId}/settings`)}
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-accent text-surface-base">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </button>

        {/* User avatar */}
        {user && (
          <div className="flex items-center gap-2 ml-1">
            <div className="w-7 h-7 rounded-full bg-surface-elevated flex items-center justify-center">
              <span className="text-xs text-ink-secondary font-medium">
                {user.name?.charAt(0).toUpperCase() || '?'}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
