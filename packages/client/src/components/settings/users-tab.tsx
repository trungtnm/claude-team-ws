import { useState } from 'react'
import { MoreVertical, Plus, UserMinus, UserCog, Mail, Link2, Loader2 } from 'lucide-react'
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
import { useMembers, useUpdateMemberRole, useRemoveMember } from '@/hooks/use-settings'
import type { Member, UserRole } from '@/types'

const roleLabels: Record<string, string> = {
  pm: 'PM',
  dev: 'Developer',
  techlead: 'Tech Lead',
  viewer: 'Viewer',
}

const roleColors: Record<string, string> = {
  pm: 'text-blue-400 bg-blue-400/10',
  dev: 'text-green-400 bg-green-400/10',
  techlead: 'text-amber-400 bg-amber-400/10',
  viewer: 'text-gray-400 bg-gray-400/10',
}

const allRoles: UserRole[] = ['pm', 'dev', 'techlead', 'viewer']

const rolePermissionHints: Record<UserRole, string> = {
  pm: 'Can triage, merge',
  dev: 'Can code, review',
  techlead: 'Full access',
  viewer: 'Read-only',
}

/** Generate initials from a name */
function getInitials(name: string): string {
  if (!name) return '??'
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '??'
}

/** Generate a deterministic color from user ID */
function getUserColor(userId: string): string {
  const colors = ['#f59e0b', '#3b82f6', '#22c55e', '#a855f7', '#ec4899', '#ef4444', '#06b6d4']
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return colors[Math.abs(hash) % colors.length]
}

function UserRow({ member, isCurrentUser }: { member: Member; isCurrentUser: boolean }) {
  const effectiveRole = (member.roleOverride ?? member.role) as UserRole
  const updateRole = useUpdateMemberRole()
  const removeMember = useRemoveMember()

  const handleChangeRole = (newRole: UserRole) => {
    updateRole.mutate(
      { userId: member.userId, roleOverride: newRole },
      {
        onSuccess: () => toast.success(`Changed ${member.name}'s role to ${roleLabels[newRole]}`),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleRemove = () => {
    removeMember.mutate(member.userId, {
      onSuccess: () => toast.success(`Removed ${member.name} from the team`),
      onError: (err) => toast.error(err.message),
    })
  }

  const handleCopyInviteLink = () => {
    navigator.clipboard.writeText(`https://ctw.dev/invite/${member.userId}`).catch(() => {})
    toast.success('Invite link copied to clipboard')
  }

  return (
    <div className="flex items-center justify-between rounded-[var(--radius-md)] px-4 py-3 transition-colors hover:bg-surface-elevated/50">
      <div className="flex items-center gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: getUserColor(member.userId) }}
        >
          {getInitials(member.name)}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-ink">{member.name}</p>
            {isCurrentUser && (
              <span className="text-xs text-accent">(you)</span>
            )}
          </div>
          <p className="text-xs text-ink-muted">{member.email}</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <Badge className={roleColors[effectiveRole]}>
            {roleLabels[effectiveRole]}
          </Badge>
          <p className="text-[10px] text-ink-muted mt-0.5">{rolePermissionHints[effectiveRole]}</p>
        </div>

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
                className={effectiveRole === role ? 'text-accent' : ''}
              >
                {roleLabels[role]}
                {effectiveRole === role && <span className="ml-auto text-xs text-accent">current</span>}
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
              disabled={isCurrentUser || removeMember.isPending}
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
  const [role, setRole] = useState<UserRole>('dev')

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

    // Invite flow requires backend user creation endpoint — not yet implemented
    toast.info(`Invitation to ${email} will be sent when the invite system is connected`)
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
            <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
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

function buildRoleSummary(members: Member[]): string {
  const counts: Record<string, number> = {}
  for (const m of members) {
    const effectiveRole = m.roleOverride ?? m.role
    const label = effectiveRole === 'techlead' ? 'TechLead' : (roleLabels[effectiveRole] ?? effectiveRole)
    counts[label] = (counts[label] ?? 0) + 1
  }
  const parts = Object.entries(counts).map(([label, count]) => `${count} ${label}`)
  return `${members.length} members \u00b7 ${parts.join(' \u00b7 ')}`
}

export function UsersTab() {
  const { data: members, isLoading } = useMembers()
  const [inviteOpen, setInviteOpen] = useState(false)

  // Get current user from auth — stored in localStorage
  const currentUserId = localStorage.getItem('ctw_user_id') ?? ''

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    )
  }

  const memberList = members ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{buildRoleSummary(memberList)}</p>
        <Button className="gap-2" size="sm" onClick={() => setInviteOpen(true)}>
          <Plus className="h-4 w-4" />
          Invite User
        </Button>
      </div>

      <Card className="divide-y divide-edge">
        {memberList.map((member) => (
          <UserRow key={member.userId} member={member} isCurrentUser={member.userId === currentUserId} />
        ))}
        {memberList.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm text-ink-muted">No members yet.</p>
          </div>
        )}
      </Card>

      <InviteUserDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </div>
  )
}
