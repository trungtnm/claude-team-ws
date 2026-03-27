import { logError } from '../utils/log-error.js'

// ─── Types ──────────────────────────────────────────────────────────────────

export type WebhookType = 'slack' | 'discord' | 'telegram'

export interface WebhookEventData {
  event: string
  projectName?: string
  sessionName?: string
  epicTitle?: string
  prUrl?: string
  error?: string
}

interface DispatchResult {
  success: boolean
  statusCode: number
  error?: string
}

// ─── Payload Formatters ─────────────────────────────────────────────────────

function formatSlackPayload(data: WebhookEventData): Record<string, unknown> {
  const title = formatTitle(data)
  const text = formatDescription(data)

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: title },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text },
      },
    ],
  }
}

function formatDiscordPayload(data: WebhookEventData): Record<string, unknown> {
  const title = formatTitle(data)
  const description = formatDescription(data)

  const colorMap: Record<string, number> = {
    session_complete: 0x22c55e, // green
    session_failed: 0xef4444, // red
    pr_ready: 0x3b82f6, // blue
    pr_merged: 0xa855f7, // purple
    question_waiting: 0xf59e0b, // yellow
    test: 0x6366f1, // indigo
  }

  return {
    embeds: [
      {
        title,
        description,
        color: colorMap[data.event] ?? 0x6b7280,
        footer: { text: 'Claude Team Workspace' },
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

function formatTelegramPayload(data: WebhookEventData, url: string): Record<string, unknown> {
  const title = formatTitle(data)
  const text = formatDescription(data)

  // Telegram URLs carry the bot token: https://api.telegram.org/bot{token}/sendMessage
  // The chat_id must be extracted from the URL query string or configured separately.
  // Convention: store as ?chat_id=12345 on the webhook URL
  const chatId = extractTelegramChatId(url)
  if (!chatId) {
    throw new Error('Telegram webhook URL must include ?chat_id=<id> parameter')
  }

  return {
    chat_id: chatId,
    text: `*${title}*\n\n${text}`,
    parse_mode: 'Markdown',
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTitle(data: WebhookEventData): string {
  const titles: Record<string, string> = {
    session_complete: 'Session Completed',
    session_failed: 'Session Failed',
    pr_ready: 'PR Ready for Review',
    pr_merged: 'PR Merged',
    question_waiting: 'Agent Needs Input',
    test: 'Test Notification',
  }
  return titles[data.event] ?? `Event: ${data.event}`
}

function formatDescription(data: WebhookEventData): string {
  const parts: string[] = []
  if (data.projectName) parts.push(`Project: ${data.projectName}`)
  if (data.sessionName) parts.push(`Session: ${data.sessionName}`)
  if (data.epicTitle) parts.push(`Epic: ${data.epicTitle}`)
  if (data.prUrl) parts.push(`PR: ${data.prUrl}`)
  if (data.error) parts.push(`Error: ${data.error}`)
  if (parts.length === 0) parts.push('This is a test notification from Claude Team Workspace.')
  return parts.join('\n')
}

function extractTelegramChatId(url: string): string {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('chat_id') ?? ''
  } catch {
    return ''
  }
}

// ─── Dispatch ───────────────────────────────────────────────────────────────

export function formatPayload(type: WebhookType, data: WebhookEventData, url: string): Record<string, unknown> {
  switch (type) {
    case 'slack':
      return formatSlackPayload(data)
    case 'discord':
      return formatDiscordPayload(data)
    case 'telegram':
      return formatTelegramPayload(data, url)
  }
}

export async function dispatch(
  type: WebhookType,
  url: string,
  data: WebhookEventData,
): Promise<DispatchResult> {
  const payload = formatPayload(type, data, url)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    })

    if (response.ok) {
      return { success: true, statusCode: response.status }
    }

    const errorText = await response.text().catch(() => 'Unknown error')
    return {
      success: false,
      statusCode: response.status,
      error: errorText.slice(0, 500),
    }
  } catch (err: unknown) {
    const message = logError('webhook-dispatch', err)
    return { success: false, statusCode: 0, error: message }
  }
}
