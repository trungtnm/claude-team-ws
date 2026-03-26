export interface WebhookConfig {
  id: string
  type: 'slack' | 'discord' | 'telegram'
  url: string
  events: string[]
  enabled: boolean
  createdAt: number
}

const now = Math.floor(Date.now() / 1000)

export const webhooks: WebhookConfig[] = [
  {
    id: 'wh-1', type: 'slack', url: 'https://hooks.slack.com/services/T0xxx/B0xxx/xxxx',
    events: ['session_complete', 'pr_ready', 'pr_merged'], enabled: true, createdAt: now - 864000,
  },
  {
    id: 'wh-2', type: 'discord', url: 'https://discord.com/api/webhooks/1234/abcdef',
    events: ['session_complete', 'pr_merged'], enabled: false, createdAt: now - 604800,
  },
  {
    id: 'wh-3', type: 'telegram', url: 'https://api.telegram.org/bot123456:ABC-DEF/sendMessage?chat_id=-1001234567890',
    events: ['session_complete', 'pr_ready', 'question_waiting'], enabled: true, createdAt: now - 172800,
  },
]

export const availableEvents = [
  { value: 'session_complete', label: 'Agent Session Complete' },
  { value: 'pr_ready', label: 'PR Ready for Review' },
  { value: 'pr_merged', label: 'PR Merged' },
  { value: 'question_waiting', label: 'Agent Needs Input' },
  { value: 'session_failed', label: 'Agent Session Failed' },
]
