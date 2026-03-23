import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CmClient from './cm-client.js'

describe('CmClient', () => {
  let client: CmClient
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    client = new CmClient('http://127.0.0.1:9900')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('should use default URL when none provided', () => {
      const defaultClient = new CmClient()
      // We verify the default by testing that health calls the default URL
      mockFetch.mockResolvedValue({ ok: true })
      defaultClient.health()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9900/health',
        expect.any(Object),
      )
    })
  })

  describe('getContext', () => {
    it('should POST to get context for a task description', async () => {
      const contextData = { rules: [{ text: 'Use strict mode', confidence: 0.9 }] }
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(contextData),
      })

      const result = await client.getContext('implement auth middleware')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9900/context',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: 'implement auth middleware' }),
        }),
      )
      expect(result).toEqual(contextData)
    })
  })

  describe('recordOutcome', () => {
    it('should POST session outcome', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recorded: true }),
      })

      const result = await client.recordOutcome('session-1', 'success', 'All tests pass')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9900/outcome',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            session_id: 'session-1',
            result: 'success',
            details: 'All tests pass',
          }),
        }),
      )
      expect(result).toEqual({ recorded: true })
    })

    it('should work without optional details', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recorded: true }),
      })

      await client.recordOutcome('session-2', 'failure')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9900/outcome',
        expect.objectContaining({
          body: JSON.stringify({
            session_id: 'session-2',
            result: 'failure',
          }),
        }),
      )
    })
  })

  describe('health', () => {
    it('should return true when service is reachable', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      const result = await client.health()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://127.0.0.1:9900/health',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('should return false when service is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'))

      const result = await client.health()

      expect(result).toBe(false)
    })
  })

  describe('error handling', () => {
    it('should throw on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      })

      await expect(client.getContext('test')).rejects.toThrow(
        'CmClient request failed [context]: HTTP 503 Service Unavailable',
      )
    })
  })
})
