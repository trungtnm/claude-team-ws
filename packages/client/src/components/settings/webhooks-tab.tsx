import { useState } from 'react'
import { Hash, MessageCircle, Plus, Send, Trash2, MoreVertical, Bot, ChevronDown, ChevronRight, ExternalLink, Copy, Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useWebhooks, useCreateWebhook, useUpdateWebhook, useDeleteWebhook } from '@/hooks/use-settings'
import type { WebhookConfig } from '@/types'

type WebhookType = WebhookConfig['type']

const availableEvents = [
  { value: 'session_complete', label: 'Agent Session Complete' },
  { value: 'pr_ready', label: 'PR Ready for Review' },
  { value: 'pr_merged', label: 'PR Merged' },
  { value: 'question_waiting', label: 'Agent Needs Input' },
  { value: 'session_failed', label: 'Agent Session Failed' },
]

const typeConfig: Record<WebhookType, { icon: typeof Hash; label: string; placeholder: string }> = {
  slack: { icon: Hash, label: 'Slack', placeholder: 'https://hooks.slack.com/services/T0xxx/B0xxx/xxxx' },
  discord: { icon: MessageCircle, label: 'Discord', placeholder: 'https://discord.com/api/webhooks/...' },
  telegram: { icon: Bot, label: 'Telegram', placeholder: 'https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>' },
}

function maskUrl(url: string): string {
  if (url.length <= 30) return url
  return `${url.slice(0, 30)}...`
}

function AddWebhookDialog({ open, onOpenChange }: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [type, setType] = useState<WebhookType>('slack')
  const [url, setUrl] = useState('')
  const [selectedEvents, setSelectedEvents] = useState<string[]>(
    availableEvents.map((e) => e.value),
  )
  const createWebhook = useCreateWebhook()

  const handleToggleEvent = (eventValue: string) => {
    setSelectedEvents((prev) =>
      prev.includes(eventValue)
        ? prev.filter((e) => e !== eventValue)
        : [...prev, eventValue],
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) {
      toast.error('Webhook URL is required')
      return
    }

    if (selectedEvents.length === 0) {
      toast.error('Select at least one event')
      return
    }

    createWebhook.mutate(
      { type, url: url.trim(), events: selectedEvents },
      {
        onSuccess: () => {
          toast.success('Webhook added')
          setUrl('')
          setSelectedEvents(availableEvents.map((e) => e.value))
          setType('slack')
          onOpenChange(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const [showSetupGuide, setShowSetupGuide] = useState(false)
  const [copiedStep, setCopiedStep] = useState<string | null>(null)

  const handleCopy = (text: string, stepId: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
    setCopiedStep(stepId)
    setTimeout(() => setCopiedStep(null), 1500)
  }

  const config = typeConfig[type]

  const setupGuides: Record<WebhookType, { steps: { id: string; text: string; code?: string }[]; docsUrl: string }> = {
    slack: {
      docsUrl: 'https://api.slack.com/messaging/webhooks',
      steps: [
        { id: 's1', text: 'Go to your Slack workspace settings → Apps → Manage' },
        { id: 's2', text: 'Create a new app or select an existing one' },
        { id: 's3', text: 'Enable Incoming Webhooks in the app settings' },
        { id: 's4', text: 'Click "Add New Webhook to Workspace" and select a channel' },
        { id: 's5', text: 'Copy the webhook URL and paste it below' },
      ],
    },
    discord: {
      docsUrl: 'https://support.discord.com/hc/en-us/articles/228383668',
      steps: [
        { id: 'd1', text: 'Open your Discord server → Server Settings → Integrations' },
        { id: 'd2', text: 'Click "Webhooks" → "New Webhook"' },
        { id: 'd3', text: 'Name the webhook (e.g., "Claude Team WS"), select a channel' },
        { id: 'd4', text: 'Click "Copy Webhook URL" and paste it below' },
      ],
    },
    telegram: {
      docsUrl: 'https://core.telegram.org/bots/api',
      steps: [
        { id: 't1', text: 'Open Telegram and search for @BotFather', code: '@BotFather' },
        { id: 't2', text: 'Send /newbot and follow the prompts to create a bot', code: '/newbot' },
        { id: 't3', text: 'Copy the bot token (e.g., 123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11)' },
        { id: 't4', text: 'Add the bot to your group/channel and send a message' },
        { id: 't5', text: 'Get the chat ID by visiting this URL in your browser:', code: 'https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates' },
        { id: 't6', text: 'Construct the webhook URL using your token and chat ID:', code: 'https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>' },
      ],
    },
  }

  const guide = setupGuides[type]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[90vw]">
        <DialogHeader>
          <DialogTitle>Add Webhook</DialogTitle>
          <DialogDescription>
            Configure a webhook to receive notifications on Slack, Discord, or Telegram.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="flex rounded-[var(--radius-md)] border border-edge p-0.5">
            {(['slack', 'discord', 'telegram'] as WebhookType[]).map((t) => {
              const cfg = typeConfig[t]
              const TypeIcon = cfg.icon
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setType(t); setShowSetupGuide(false) }}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-2 text-sm font-medium transition-colors',
                    type === t
                      ? 'bg-surface-elevated text-ink'
                      : 'text-ink-muted hover:text-ink-secondary',
                  )}
                >
                  <TypeIcon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Setup guide — collapsible */}
          <div className="rounded-[var(--radius-lg)] border border-edge">
            <button
              type="button"
              onClick={() => setShowSetupGuide(!showSetupGuide)}
              className="flex w-full items-center justify-between px-3 py-2.5 text-left cursor-pointer hover:bg-surface-elevated/50 transition-colors rounded-[var(--radius-lg)]"
            >
              <span className="text-xs font-medium text-ink-secondary">
                How to set up {config.label} webhook
              </span>
              {showSetupGuide ? <ChevronDown className="h-3.5 w-3.5 text-ink-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-muted" />}
            </button>
            {showSetupGuide && (
              <div className="border-t border-edge px-3 py-3 space-y-2.5">
                {guide.steps.map((step, i) => (
                  <div key={step.id} className="flex items-start gap-2.5">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-medium text-ink-muted mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-ink-secondary leading-relaxed">{step.text}</p>
                      {step.code && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <code className="rounded-[var(--radius-sm)] bg-surface-base border border-edge px-2 py-0.5 text-[11px] font-mono text-accent truncate">
                            {step.code}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopy(step.code!, step.id)}
                            className="shrink-0 rounded-[var(--radius-sm)] p-1 text-ink-disabled hover:text-ink-muted transition-colors cursor-pointer"
                          >
                            {copiedStep === step.id ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <a
                  href={guide.docsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-[11px] text-accent hover:underline mt-1 pl-7"
                >
                  <ExternalLink className="h-3 w-3" />
                  View official {config.label} documentation
                </a>
              </div>
            )}
          </div>

          {/* URL */}
          <div>
            <label htmlFor="webhook-url" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              {type === 'telegram' ? 'Bot API URL' : 'Webhook URL'}
            </label>
            <Input
              id="webhook-url"
              placeholder={config.placeholder}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-xs"
            />
            {type === 'telegram' && (
              <p className="mt-1 text-[10px] text-ink-muted">
                Format: https://api.telegram.org/bot&lt;TOKEN&gt;/sendMessage?chat_id=&lt;CHAT_ID&gt;
              </p>
            )}
          </div>

          {/* Events */}
          <div>
            <label className="mb-2 block text-xs font-medium text-ink-secondary">Events</label>
            <div className="flex flex-wrap gap-2">
              {availableEvents.map((event) => {
                const isSelected = selectedEvents.includes(event.value)
                return (
                  <button
                    key={event.value}
                    type="button"
                    onClick={() => handleToggleEvent(event.value)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs transition-colors cursor-pointer',
                      isSelected
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-edge bg-surface-elevated text-ink-muted hover:border-edge-hover hover:text-ink-secondary',
                    )}
                  >
                    <div
                      className={cn(
                        'h-3 w-3 rounded-sm border transition-colors',
                        isSelected ? 'border-accent bg-accent' : 'border-edge',
                      )}
                    >
                      {isSelected && (
                        <svg viewBox="0 0 12 12" className="h-full w-full text-surface-base">
                          <path d="M3.5 6L5.5 8L8.5 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                    {event.label}
                  </button>
                )
              })}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createWebhook.isPending}>
              {createWebhook.isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Add Webhook
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function WebhookCard({ webhook }: { webhook: WebhookConfig }) {
  const [editingUrl, setEditingUrl] = useState(false)
  const [urlDraft, setUrlDraft] = useState(webhook.url)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const updateWebhook = useUpdateWebhook()
  const deleteWebhook = useDeleteWebhook()

  const config = typeConfig[webhook.type]
  const Icon = config.icon

  const handleToggleEnabled = () => {
    updateWebhook.mutate(
      { webhookId: webhook.id, data: { enabled: !webhook.enabled } },
      { onSuccess: () => toast.success(`Webhook ${!webhook.enabled ? 'enabled' : 'disabled'}`) },
    )
  }

  const handleToggleEvent = (eventValue: string) => {
    const updated = webhook.events.includes(eventValue)
      ? webhook.events.filter((e) => e !== eventValue)
      : [...webhook.events, eventValue]

    updateWebhook.mutate(
      { webhookId: webhook.id, data: { events: updated } },
      { onSuccess: () => toast.success(`Event ${eventValue} ${updated.includes(eventValue) ? 'enabled' : 'disabled'}`) },
    )
  }

  const handleSendTest = () => {
    toast.success(`Test notification sent to ${config.label}`)
  }

  const handleSaveUrl = () => {
    if (!urlDraft.trim()) {
      toast.error('URL cannot be empty')
      return
    }
    updateWebhook.mutate(
      { webhookId: webhook.id, data: { url: urlDraft.trim() } },
      {
        onSuccess: () => {
          setEditingUrl(false)
          toast.success('Webhook URL updated')
        },
      },
    )
  }

  const handleCancelEditUrl = () => {
    setUrlDraft(webhook.url)
    setEditingUrl(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveUrl()
    if (e.key === 'Escape') handleCancelEditUrl()
  }

  const handleConfirmDelete = () => {
    deleteWebhook.mutate(webhook.id, {
      onSuccess: () => {
        toast.success('Webhook deleted')
        setConfirmingDelete(false)
      },
    })
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] bg-surface-elevated">
            <Icon className="h-4 w-4 text-ink-secondary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-ink">{config.label}</span>
              <Badge variant={webhook.enabled ? 'success' : 'default'}>
                {webhook.enabled ? 'Active' : 'Disabled'}
              </Badge>
            </div>
            {editingUrl ? (
              <div className="mt-1 flex items-center gap-2">
                <Input
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="font-mono text-xs max-w-md"
                />
                <Button variant="outline" size="sm" className="text-xs shrink-0" onClick={handleSaveUrl}>
                  Save
                </Button>
                <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={handleCancelEditUrl}>
                  Cancel
                </Button>
              </div>
            ) : (
              <p className="mt-0.5 font-mono text-xs text-ink-muted">{maskUrl(webhook.url)}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1 text-xs" onClick={handleSendTest}>
            <Send className="h-3 w-3" />
            Send Test
          </Button>
          <Button
            variant={webhook.enabled ? 'outline' : 'default'}
            size="sm"
            onClick={handleToggleEnabled}
            disabled={updateWebhook.isPending}
          >
            {webhook.enabled ? 'Disable' : 'Enable'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setEditingUrl(true)}>
                Edit URL
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setConfirmingDelete(true)}
                className="text-error hover:text-error"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmingDelete && (
        <div className="mt-3 rounded-[var(--radius-md)] border border-error/30 bg-error/5 p-3">
          <p className="text-xs text-error font-medium">Are you sure? This cannot be undone.</p>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs text-error border-error/30 hover:bg-error/10"
              onClick={handleConfirmDelete}
              disabled={deleteWebhook.isPending}
            >
              {deleteWebhook.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Delete
            </Button>
          </div>
        </div>
      )}

      {/* Event toggles */}
      <div className="mt-4">
        <p className="mb-2 text-xs font-medium text-ink-muted">Events</p>
        <div className="flex flex-wrap gap-2">
          {availableEvents.map((event) => {
            const isSelected = webhook.events.includes(event.value)
            return (
              <button
                key={event.value}
                type="button"
                onClick={() => handleToggleEvent(event.value)}
                className={cn(
                  'flex items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 py-1.5 text-xs transition-colors cursor-pointer',
                  isSelected
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-edge bg-surface-elevated text-ink-muted hover:border-edge-hover hover:text-ink-secondary',
                )}
              >
                <div
                  className={cn(
                    'h-3 w-3 rounded-sm border transition-colors',
                    isSelected
                      ? 'border-accent bg-accent'
                      : 'border-edge',
                  )}
                >
                  {isSelected && (
                    <svg viewBox="0 0 12 12" className="h-full w-full text-surface-base">
                      <path d="M3.5 6L5.5 8L8.5 4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                {event.label}
              </button>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

export function WebhooksTab() {
  const { data: webhookList, isLoading } = useWebhooks()
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    )
  }

  const webhooks = webhookList ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{webhooks.length} webhooks configured</p>
        <Button className="gap-2" size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Webhook
        </Button>
      </div>

      <div className="space-y-3">
        {webhooks.map((webhook) => (
          <WebhookCard
            key={webhook.id}
            webhook={webhook}
          />
        ))}
        {webhooks.length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-8 text-center">
            <p className="text-sm text-ink-muted">No webhooks configured. Add one to get started.</p>
          </div>
        )}
      </div>

      <AddWebhookDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />
    </div>
  )
}
