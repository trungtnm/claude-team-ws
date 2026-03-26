import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { ChevronDown, Plus, LayoutDashboard, Inbox, Bot, GitBranch, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { NotificationDropdown } from '@/components/layout/notification-dropdown'
import { CaptureComposer } from '@/components/capture/capture-composer'
import { useProject } from '@/providers/project-provider'
import { useAuth } from '@/providers/auth-provider'
import { useCaptureStore } from '@/stores/capture-store'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/board', label: 'Board', icon: LayoutDashboard },
  { to: '/captures', label: 'Captures', icon: Inbox },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/graph', label: 'Graph', icon: GitBranch },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Header() {
  const { project, projects, setProjectId } = useProject()
  const { user, logout } = useAuth()
  const { toggleComposer } = useCaptureStore()

  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : '??'

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault()
        toggleComposer()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleComposer])

  return (
    <header className="flex h-12 items-center border-b border-edge bg-surface-base px-4">
      {/* Left: Logo + Project selector */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-xs font-bold text-surface-base">
          CT
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1 text-sm font-semibold text-ink px-1.5">
              {project?.name ?? 'Select project'}
              <ChevronDown className="h-3 w-3 text-ink-muted" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {projects.map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => setProjectId(p.id)}
                className={cn(p.id === project?.id && 'font-semibold')}
              >
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center: Navigation */}
      <nav className="flex items-center gap-0.5 ml-6">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-surface-elevated text-ink'
                  : 'text-ink-muted hover:text-ink-secondary hover:bg-surface-elevated/50',
              )
            }
          >
            <item.icon className="h-3.5 w-3.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Right: Capture CTA + Notifications + User avatar */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={toggleComposer}
          className="gap-1.5 font-medium h-8"
        >
          <Plus className="h-3.5 w-3.5" />
          Capture
          <kbd className="ml-0.5 hidden rounded bg-surface-base/20 px-1 py-0.5 text-[9px] font-normal sm:inline-block">
            ⌘J
          </kbd>
        </Button>

        <NotificationDropdown />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="User menu"
              className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-surface-base cursor-pointer hover:opacity-90 transition-opacity"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-ink">{user?.name}</p>
              <p className="text-xs text-ink-muted">{user?.email}</p>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-error focus:text-error">
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CaptureComposer />
    </header>
  )
}
