import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import WebhookService from './webhook-service.js'

describe('WebhookService', () => {
  let service: WebhookService
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    service = new WebhookService()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('send - Slack', () => {
    it('should format and send Slack webhook with blocks', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      await service.send('https://hooks.slack.com/test', 'slack', {
        event: 'session_complete',
        title: 'Agent Finished',
        body: 'All tests passing',
        url: 'https://github.com/pr/123',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.blocks).toBeDefined()
      expect(body.blocks[0].type).toBe('section')
      expect(body.blocks[0].text.type).toBe('mrkdwn')
      expect(body.blocks[0].text.text).toContain('Agent Finished')
    })

    it('should include body and url in Slack message when provided', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      await service.send('https://hooks.slack.com/test', 'slack', {
        event: 'pr_ready',
        title: 'PR Ready',
        body: 'Review needed',
        url: 'https://github.com/pr/456',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      const blockTexts = body.blocks.map((b: any) => b.text?.text || '').join(' ')
      expect(blockTexts).toContain('Review needed')
      expect(blockTexts).toContain('https://github.com/pr/456')
    })
  })

  describe('send - Discord', () => {
    it('should format and send Discord webhook with embed', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      await service.send('https://discord.com/webhook/test', 'discord', {
        event: 'session_complete',
        title: 'Agent Finished',
        body: 'All tests passing',
        url: 'https://github.com/pr/123',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://discord.com/webhook/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.embeds).toBeDefined()
      expect(body.embeds[0].title).toBe('Agent Finished')
      expect(body.embeds[0].description).toBe('All tests passing')
      expect(body.embeds[0].url).toBe('https://github.com/pr/123')
    })

    it('should handle Discord payload without optional fields', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      await service.send('https://discord.com/webhook/test', 'discord', {
        event: 'pr_merged',
        title: 'PR Merged',
      })

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.embeds[0].title).toBe('PR Merged')
      expect(body.embeds[0].description).toBeUndefined()
      expect(body.embeds[0].url).toBeUndefined()
    })
  })

  describe('error handling', () => {
    it('should throw on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      })

      await expect(
        service.send('https://hooks.slack.com/test', 'slack', {
          event: 'test',
          title: 'Test',
        }),
      ).rejects.toThrow('WebhookService send failed: HTTP 429 Too Many Requests')
    })

    it('should throw on network error', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      await expect(
        service.send('https://hooks.slack.com/test', 'slack', {
          event: 'test',
          title: 'Test',
        }),
      ).rejects.toThrow('WebhookService send failed: ECONNREFUSED')
    })
  })
})
