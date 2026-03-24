import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.js'
import { webhookConfigs } from '../db/schema.js'

interface WebhookPayload {
  event: string
  project_id: string
  data: Record<string, unknown>
}

/** Block requests to internal/private network addresses (SSRF protection) */
function isPrivateUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr)
    const hostname = url.hostname.toLowerCase()

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true

    // Block private IP ranges
    if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)) return true

    // Block link-local
    if (hostname.startsWith('169.254.')) return true

    // Block cloud metadata endpoints
    if (hostname === 'metadata.google.internal') return true
    if (hostname === '169.254.169.254') return true

    // Block non-HTTPS in production
    if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') return true

    return false
  } catch {
    return true // Invalid URL — block it
  }
}

class WebhookService {
  async dispatch(payload: WebhookPayload): Promise<void> {
    const configs = db.select()
      .from(webhookConfigs)
      .where(and(
        eq(webhookConfigs.project_id, payload.project_id),
        eq(webhookConfigs.enabled, 1),
      ))
      .all()

    const dispatches = configs
      .filter((config) => {
        const events: string[] = JSON.parse(config.events)
        if (!events.includes(payload.event)) return false
        if (isPrivateUrl(config.url)) {
          console.warn(`WebhookService: blocking private URL ${config.url} (config ${config.id})`)
          return false
        }
        return true
      })
      .map(async (config) => {
        try {
          if (config.type === 'slack') {
            await this.sendSlack(config.url, payload)
          } else if (config.type === 'discord') {
            await this.sendDiscord(config.url, payload)
          }
        } catch (err) {
          console.error(`WebhookService.dispatch failed for config ${config.id}: ${(err as Error).message}`)
        }
      })

    await Promise.allSettled(dispatches)
  }

  private async sendSlack(url: string, payload: WebhookPayload): Promise<void> {
    const text = this.formatMessage(payload)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`)
  }

  private async sendDiscord(url: string, payload: WebhookPayload): Promise<void> {
    const content = this.formatMessage(payload)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`Discord webhook returned ${res.status}`)
  }

  private formatMessage(payload: WebhookPayload): string {
    const { event, data } = payload
    switch (event) {
      case 'session_complete':
        return `Agent session completed: ${data.session_id ?? 'unknown'}`
      case 'pr_ready':
        return `PR ready for review: ${data.pr_url ?? 'unknown'}`
      case 'pr_merged':
        return `PR merged: ${data.pr_url ?? 'unknown'}`
      default:
        return `[${event}] ${JSON.stringify(data).slice(0, 200)}`
    }
  }
}

export const webhookService = new WebhookService()
