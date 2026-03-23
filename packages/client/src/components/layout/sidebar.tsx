import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Bot, GitBranch, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/board', label: 'Board', icon: LayoutDashboard },
  { to: '/agents', label: 'Agents', icon: Bot },
  { to: '/graph', label: 'Đồ thị', icon: GitBranch },
  { to: '/settings', label: 'Cài đặt', icon: Settings },
] as const

export function Sidebar() {
  return (
    <aside className="flex w-56 flex-col border-r border-zinc-800 bg-zinc-950 py-4">
      <nav className="flex flex-1 flex-col gap-1 px-3">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-zinc-800 text-zinc-50'
                  : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200',
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
