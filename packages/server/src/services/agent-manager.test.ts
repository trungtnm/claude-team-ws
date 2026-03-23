import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { Readable } from 'stream'
import { spawn } from 'child_process'

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}))

const mockedSpawn = vi.mocked(spawn)

function createMockProcess(pid: number): any {
  const proc = new EventEmitter() as any
  proc.pid = pid
  proc.stdout = new Readable({ read() {} })
  proc.stderr = new Readable({ read() {} })
  proc.kill = vi.fn()
  return proc
}

import AgentManager from './agent-manager.js'

describe('AgentManager', () => {
  let manager: AgentManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new AgentManager()
  })

  describe('spawn', () => {
    it('should spawn claude with correct arguments', () => {
      const proc = createMockProcess(1234)
      mockedSpawn.mockReturnValue(proc)

      const onEvent = vi.fn()
      const onExit = vi.fn()

      manager.spawn({
        sessionId: 'session-1',
        prompt: 'Fix the bug',
        model: 'sonnet',
        repoPaths: ['/repo1', '/repo2'],
        onEvent,
        onExit,
      })

      expect(mockedSpawn).toHaveBeenCalledWith(
        'claude',
        [
          '-p',
          '--output-format=stream-json',
          '--session-id', 'session-1',
          '--model', 'sonnet',
          '--add-dir', '/repo1',
          '--add-dir', '/repo2',
          'Fix the bug',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      )
    })

    it('should return the PID', () => {
      const proc = createMockProcess(5678)
      mockedSpawn.mockReturnValue(proc)

      const pid = manager.spawn({
        sessionId: 's1',
        prompt: 'test',
        model: 'sonnet',
        repoPaths: ['/repo'],
        onEvent: vi.fn(),
        onExit: vi.fn(),
      })

      expect(pid).toBe(5678)
    })

    it('should parse NDJSON lines and call onEvent', () => {
      const proc = createMockProcess(1111)
      mockedSpawn.mockReturnValue(proc)

      const onEvent = vi.fn()
      manager.spawn({
        sessionId: 's1',
        prompt: 'test',
        model: 'sonnet',
        repoPaths: ['/repo'],
        onEvent,
        onExit: vi.fn(),
      })

      // Simulate NDJSON data
      proc.stdout.emit('data', Buffer.from('{"type":"assistant","content":"hello"}\n'))

      expect(onEvent).toHaveBeenCalledWith({ type: 'assistant', content: 'hello' })
    })

    it('should handle partial lines across data chunks', () => {
      const proc = createMockProcess(2222)
      mockedSpawn.mockReturnValue(proc)

      const onEvent = vi.fn()
      manager.spawn({
        sessionId: 's1',
        prompt: 'test',
        model: 'sonnet',
        repoPaths: ['/repo'],
        onEvent,
        onExit: vi.fn(),
      })

      // Send partial line, then rest
      proc.stdout.emit('data', Buffer.from('{"type":"ass'))
      proc.stdout.emit('data', Buffer.from('istant"}\n'))

      expect(onEvent).toHaveBeenCalledWith({ type: 'assistant' })
    })

    it('should call onExit when process exits', () => {
      const proc = createMockProcess(3333)
      mockedSpawn.mockReturnValue(proc)

      const onExit = vi.fn()
      manager.spawn({
        sessionId: 's1',
        prompt: 'test',
        model: 'sonnet',
        repoPaths: ['/repo'],
        onEvent: vi.fn(),
        onExit,
      })

      proc.emit('close', 0)

      expect(onExit).toHaveBeenCalledWith(0)
    })
  })

  describe('kill', () => {
    it('should send SIGTERM to the process', () => {
      const originalKill = process.kill
      process.kill = vi.fn() as any

      manager.kill(4444)

      expect(process.kill).toHaveBeenCalledWith(4444, 'SIGTERM')

      process.kill = originalKill
    })
  })

  describe('isRunning', () => {
    it('should return true when process is alive', () => {
      const originalKill = process.kill
      process.kill = vi.fn() as any

      const result = manager.isRunning(9999)

      expect(process.kill).toHaveBeenCalledWith(9999, 0)
      expect(result).toBe(true)

      process.kill = originalKill
    })

    it('should return false when process is not alive', () => {
      const originalKill = process.kill
      process.kill = vi.fn().mockImplementation(() => {
        throw new Error('ESRCH')
      }) as any

      const result = manager.isRunning(9999)

      expect(result).toBe(false)

      process.kill = originalKill
    })
  })
})
