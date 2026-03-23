import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AgentMailClient from './agent-mail-client.js'

describe('AgentMailClient', () => {
  let client: AgentMailClient
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch
    client = new AgentMailClient('http://localhost:8800', 'test-token')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('registerAgent', () => {
    it('should POST JSON-RPC request to register agent', async () => {
      const responseData = { result: { agentId: 'agent-123' } }
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      })

      const result = await client.registerAgent('my-project', 'sonnet', 'worker-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8800/mcp/',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'register_agent',
            params: { project: 'my-project', model: 'sonnet', agent_name: 'worker-1' },
          }),
        }),
      )
      expect(result).toEqual(responseData)
    })
  })

  describe('sendMessage', () => {
    it('should POST JSON-RPC request to send message', async () => {
      const responseData = { result: { messageId: 'msg-456' } }
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      })

      const result = await client.sendMessage('thread-1', 'Hello', 'Body text')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8800/mcp/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'send_message',
            params: { thread_id: 'thread-1', subject: 'Hello', body: 'Body text' },
          }),
        }),
      )
      expect(result).toEqual(responseData)
    })
  })

  describe('fetchInbox', () => {
    it('should POST JSON-RPC request to fetch inbox', async () => {
      const responseData = { result: { messages: [] } }
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(responseData),
      })

      const result = await client.fetchInbox('worker-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8800/mcp/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'fetch_inbox',
            params: { agent_name: 'worker-1' },
          }),
        }),
      )
      expect(result).toEqual(responseData)
    })
  })

  describe('health', () => {
    it('should return true when service is reachable', async () => {
      mockFetch.mockResolvedValue({ ok: true })

      const result = await client.health()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8800/mcp/',
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
        status: 500,
        statusText: 'Internal Server Error',
      })

      await expect(client.registerAgent('p', 'm', 'a')).rejects.toThrow(
        'AgentMailClient request failed [register_agent]: HTTP 500 Internal Server Error',
      )
    })
  })
})
