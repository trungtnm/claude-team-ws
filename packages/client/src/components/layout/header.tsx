import { Bell, ChevronDown, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Header() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-4">
      {/* Logo / Title */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold">
          CT
        </div>
        <span className="text-lg font-semibold tracking-tight">
          Claude Team WS
        </span>
      </div>

      {/* Project selector */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 text-zinc-400">
          <span>Chọn dự án</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </div>

      {/* Right side: notifications + avatar */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold">
            3
          </span>
        </Button>
        <Button variant="ghost" size="icon">
          <User className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
