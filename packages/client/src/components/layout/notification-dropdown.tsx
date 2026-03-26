import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, GitPullRequest, MessageSquare, HelpCircle, GitMerge } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/use-notifications'
import type { Notification } from '@/types'

const typeIcons: Record<Notification['type'], typeof Bell> = {
  agent_complete: Bell,
  pr_ready: GitPullRequest,
  review_needed: MessageSquare,
  question_waiting: HelpCircle,
  merge_complete: GitMerge,
}

export function NotificationDropdown() {
  const navigate = useNavigate()
  const { data: items = [] } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const [open, setOpen] = useState(false)

  const unreadCount = items.filter((n) => !n.read).length

  const handleMarkAllRead = () => {
    markAllRead.mutate(undefined, {
      onSuccess: () => toast.success('All notifications marked as read'),
    })
  }

  const handleClickNotification = (notification: Notification) => {
    if (!notification.read) {
      markRead.mutate(notification.id)
    }
    setOpen(false)
    if (notification.link) navigate(notification.link)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label="Notifications" data-testid="notification-trigger">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white">
              {unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-2.5 py-2">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="text-[11px] text-accent hover:underline cursor-pointer"
            >
              Mark all read
            </button>
          )}
        </div>

        <DropdownMenuSeparator />

        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Bell className="h-8 w-8 mb-2" style={{ color: 'var(--text-disabled)' }} />
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No notifications yet</p>
            </div>
          ) : (
            items.map((notification) => {
              const Icon = typeIcons[notification.type]
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleClickNotification(notification)}
                  className={cn(
                    'flex w-full items-start gap-3 px-2.5 py-2.5 text-left transition-colors cursor-pointer',
                    'hover:bg-surface-elevated rounded-[var(--radius-sm)]',
                  )}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm', notification.read ? 'text-ink-secondary' : 'font-medium text-ink')}>
                      {notification.title}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-muted truncate">
                      {notification.body}
                    </p>
                    <p className="mt-1 text-[10px] text-ink-muted">
                      {formatDistanceToNow(notification.createdAt * 1000, { addSuffix: true })}
                    </p>
                  </div>
                  {!notification.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                  )}
                </button>
              )
            })
          )}
        </div>

        <DropdownMenuSeparator />

        <div className="px-2.5 py-2 text-center">
          <button
            type="button"
            className="text-xs text-accent hover:underline cursor-pointer"
            onClick={() => { setOpen(false); toast.info('Notifications page coming soon') }}
          >
            View all notifications
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
