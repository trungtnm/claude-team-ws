import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, UserPlus, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Member {
  user_id: string
  name: string
  email: string
  role: string
  role_override: string | null
  created_at: number
}

const roleColors: Record<string, string> = {
  pm: 'bg-blue-500/15 text-blue-400',
  dev: 'bg-green-500/15 text-green-400',
  techlead: 'bg-purple-500/15 text-purple-400',
  viewer: 'bg-gray-500/15 text-gray-400',
}

export function UsersTab() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<{ members: Member[] }>({
    queryKey: ['members', projectId],
    queryFn: () => api.get(`/projects/${projectId}/members`),
    enabled: !!projectId,
  })

  const updateRole = useMutation({
    mutationFn: ({ userId, roleOverride }: { userId: string; roleOverride: string }) =>
      api.patch(`/projects/${projectId}/members/${userId}`, { role_override: roleOverride }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members', projectId] })
      toast.success('Role updated')
    },
    onError: (err) => toast.error(err.message),
  })

  const members = data?.members ?? []

  return (
    <div className="space-y-4 py-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">{members.length} members</p>
        <Button size="sm" variant="outline" className="border-edge text-ink-secondary">
          <UserPlus className="h-4 w-4 mr-1" /> Invite
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-ink-muted">Loading...</div>
      ) : members.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-10 w-10 mx-auto mb-2 text-ink-disabled" />
          <p className="text-ink-muted">No members yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {members.map((member) => {
            const effectiveRole = member.role_override ?? member.role
            return (
              <Card key={member.user_id} className="p-4 bg-surface-raised border-edge">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-medium text-accent">
                      {member.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-ink">{member.name}</p>
                      <p className="text-xs text-ink-disabled">{member.email}</p>
                    </div>
                    <Badge className={roleColors[effectiveRole] ?? roleColors.viewer}>
                      <Shield className="h-3 w-3 mr-1" />
                      {effectiveRole}
                    </Badge>
                  </div>
                  <Select
                    value={effectiveRole}
                    onValueChange={(v) => updateRole.mutate({ userId: member.user_id, roleOverride: v })}
                  >
                    <SelectTrigger className="w-32 bg-surface-base border-edge text-ink text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pm">PM</SelectItem>
                      <SelectItem value="dev">Dev</SelectItem>
                      <SelectItem value="techlead">TechLead</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
