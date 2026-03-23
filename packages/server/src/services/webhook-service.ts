interface WebhookPayload {
  event: string
  title: string
  body?: string
  url?: string
}

interface SlackBlock {
  type: string
  text?: {
    type: string
    text: string
  }
}

interface DiscordEmbed {
  title: string
  description?: string
  url?: string
  color?: number
  footer?: {
    text: string
  }
}

class WebhookService {
  async send(
    webhookUrl: string,
    type: 'slack' | 'discord',
    payload: WebhookPayload,
  ): Promise<void> {
    const formatted = type === 'slack'
      ? this.formatSlack(payload)
      : this.formatDiscord(payload)

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formatted),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('HTTP ')) {
        throw new Error(`WebhookService send failed: ${error.message}`)
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`WebhookService send failed: ${message}`)
    }
  }

  private formatSlack(payload: WebhookPayload): { blocks: SlackBlock[] } {
    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${payload.title}*\n_Event: ${payload.event}_`,
        },
      },
    ]

    if (payload.body) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: payload.body,
        },
      })
    }

    if (payload.url) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `<${payload.url}|View Details>`,
        },
      })
    }

    return { blocks }
  }

  private formatDiscord(payload: WebhookPayload): { embeds: DiscordEmbed[] } {
    const embed: DiscordEmbed = {
      title: payload.title,
      color: 0x5865f2, // Discord blurple
      footer: {
        text: `Event: ${payload.event}`,
      },
    }

    if (payload.body) {
      embed.description = payload.body
    }

    if (payload.url) {
      embed.url = payload.url
    }

    return { embeds: [embed] }
  }
}

export default WebhookService
