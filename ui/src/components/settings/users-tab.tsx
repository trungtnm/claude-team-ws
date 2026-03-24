import { useState } from 'react'
import { MoreVertical, Plus, UserMinus, UserCog, Mail, Link2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { users, currentUser, roleLabels, roleColors, type User } from '@/data/users'

const allRoles = Object.keys(roleLabels) as Array<User['role']>

const rolePermissionHints: Record<User['role'], string> = {
  pm: 'Can triage, merge',
  dev: 'Can code, review',
  techlead: 'Full access',
  viewer: 'Read-only',
}

/** Simulated last active data per user id */
const lastActiveMap: Record<string, string> = {
  'u-1': 'Active now',
  'u-2': '2 hours ago',
  'u-3': 'Active now',
  'u-4': '3 days ago',
  'u-5': '5 days ago',
}

const pendingUsers = new Set(['u-5'])

function UserRow({ user }: { user: User }) {
  const [currentRole, setCurrentRole] = useState(user.role)
  const isCurrentUser = user.id === currentUser.id
  const isPending = pendingUsers.has(user.id)
  const lastActive = lastActiveMap[user.id] ?? 'Unknown'

  const handleChangeRole = (newRole: User['role']) => {
    setCurrentRole(newRole)
    toast.success(`Changed ${user.name}'s role to ${roleLabels[newRole]}`)
  }

  const handleRemove = () => {
    toast.error(`Removed ${user.name} from the team`)
  }

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(`https://ctw.dev/invite/${user.id}`).catch(() => {})
    toast.success('Invite link copied to clipboard')
  }

  const handleResendInvite = () => {
    toast.success(`Invite resent to ${user.email}`)
  }

  return (
    <div className="flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3 transition-colors hover:bg-surface-elevated/50">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: user.color }}
        >
          {user.initials}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">{user.name}</p>
            {isCurrentUser && (
              <span className="text-xs text-accent">(you)</span>
            )}
            {isPending && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-yellow-400 border-yellow-400/30">
                Pending
              </Badge>
            )}
          </div>
          <p className="text-xs text-ink-muted">{user.email}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="h-3 w-3 text-ink-muted" />
            <span className="text-[11px] text-ink-muted">{lastActive}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <Badge className={roleColors[currentRole]}>
            {roleLabels[currentRole]}
          </Badge>
          <p className="text-[10px] text-ink-muted mt-0.5">{rolePermissionHints[currentRole]}</p>
        </div>

        {isPending && (
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={handleResendInvite}>
            <Mail className="h-3 w-3" />
            Resend
          </Button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <UserCog className="mr-1.5 inline h-3.5 w-3.5" />
              Change Role
            </DropdownMenuLabel>
            {allRoles.map((role) => (
              <DropdownMenuItem
                key={role}
                onClick={() => handleChangeRole(role)}
                className={currentRole === role ? 'text-accent' : ''}
              >
                {roleLabels[role]}
                {currentRole === role && <span className="ml-auto text-xs text-accent">current</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleCopyInviteLink}>
              <Link2 className="h-4 w-4" />
              Copy invite link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleRemove}
              className="text-error hover:text-error"
              disabled={isCurrentUser}
            >
              <UserMinus className="h-4 w-4" />
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function InviteUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<User['role']>('dev')

  const resetForm = () => {
    setName('')
    setEmail('')
    setRole('dev')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!name.trim()) {
      toast.error('Name is required')
      return
    }

    if (!email.trim()) {
      toast.error('Email is required')
      return
    }

    toast.success(`Invite sent to ${email}`)
    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
          <DialogDescription>
            Send an invitation to join the project team.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="invite-name" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Name
            </label>
            <Input
              id="invite-name"
              placeholder="Jane Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="invite-email" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="jane@team.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="invite-role" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v as User['role'])}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    <div className="flex items-center gap-2">
                      <span>{roleLabels[r]}</span>
                      <span className="text-[11px] text-ink-muted">{rolePermissionHints[r]}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              Send Invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function buildRoleSummary(): string {
  const counts: Record<string, number> = {}
  for (const user of users) {
    const label = user.role === 'techlead' ? 'TechLead' : roleLabels[user.role]
    counts[label] = (counts[label] ?? 0) + 1
  }
  const parts = Object.entries(counts).map(([label, count]) => `${count} ${label}`)
  return `${users.length} members \u00b7 ${parts.join(' \u00b7 ')}`
}

export function UsersTab() {
  const [inviteOpen, setInviteOpen] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{buildRoleSummary()}</p>
        <Button className="gap-2" size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      <Card className="divide-y divide-edge">
        {users.map((user) => (
          <UserRow key={user.id} user={user} />
        ))}
      </Card>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
