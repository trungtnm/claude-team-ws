import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Plus, Trash2 } from 'lucide-react'
import { useWebhooksQuery, useCreateWebhookMutation, useDeleteWebhookMutation } from '@/hooks/use-webhooks'

export function WebhooksTab() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useWebhooksQuery(projectId ?? '')
  const createWebhook = useCreateWebhookMutation(projectId ?? '')
  const deleteWebhook = useDeleteWebhookMutation(projectId ?? '')
  const [url, setUrl] = useState('')
  const [type, setType] = useState<'slack' | 'discord'>('slack')

  const handleCreate = () => {
    if (!url.trim()) return
    createWebhook.mutate({ type, url }, {
      onSuccess: () => setUrl(''),
    })
  }

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as 'slack' | 'discord')}
          className="text-sm bg-surface-raised border border-edge rounded px-3 py-2 text-ink"
        >
          <option value="slack">Slack</option>
          <option value="discord">Discord</option>
        </select>
        <Input
          placeholder="Webhook URL..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="text-sm"
        />
        <Button size="sm" onClick={handleCreate} disabled={createWebhook.isPending}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-muted">Loading webhooks...</p>
      ) : (
        <div className="space-y-2">
          {data?.webhooks.map((wh) => (
            <div key={wh.id} className="flex items-center gap-3 p-3 rounded bg-surface-raised">
              <Badge variant="outline" className="text-[10px]">{wh.type}</Badge>
              <span className="text-sm text-ink truncate flex-1">{wh.url}</span>
              <span className="text-[10px] text-ink-muted">
                {wh.events.join(', ')}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-error"
                onClick={() => deleteWebhook.mutate(wh.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {data?.webhooks.length === 0 && (
            <p className="text-sm text-ink-muted text-center py-8">No webhooks configured.</p>
          )}
        </div>
      )}
    </div>
  )
}
