import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockExecFileAsync } = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
}))

vi.mock('child_process', () => ({
  execFile: vi.fn(),
}))

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}))

import BeadsService from './beads-service.js'

describe('BeadsService', () => {
  let service: BeadsService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new BeadsService('/test/project')
  })

  describe('list', () => {
    it('should call br list --json with no options', async () => {
      const beads = [{ id: 'a01-1234', title: 'Test bead' }]
      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(beads) })

      const result = await service.list()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['list', '--json'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual(beads)
    })

    it('should pass status and sort options', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '[]' })

      await service.list({ status: 'open', sort: 'priority' })

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['list', '--json', '--status', 'open', '--sort', 'priority'],
        { cwd: '/test/project' },
      )
    })
  })

  describe('show', () => {
    it('should call br show with bead id and --json', async () => {
      const bead = { id: 'a01-1234', title: 'Test' }
      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(bead) })

      const result = await service.show('a01-1234')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['show', 'a01-1234', '--json'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual(bead)
    })
  })

  describe('create', () => {
    it('should call br create with title and options', async () => {
      const created = { id: 'a01-5678', title: 'New bead' }
      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(created) })

      const result = await service.create('New bead', {
        priority: 1,
        type: 'feat',
        labels: ['backend', 'api'],
        description: 'Some description',
      })

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        [
          'create', '--actor', 'assistant', '--json',
          '--title', 'New bead',
          '--priority', '1',
          '--type', 'feat',
          '--labels', 'backend',
          '--labels', 'api',
          '--description', 'Some description',
        ],
        { cwd: '/test/project' },
      )
      expect(result).toEqual(created)
    })

    it('should handle create with minimal options', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"id":"a01-9999"}' })

      await service.create('Minimal bead', {})

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['create', '--actor', 'assistant', '--json', '--title', 'Minimal bead'],
        { cwd: '/test/project' },
      )
    })
  })

  describe('update', () => {
    it('should call br update with bead id and options', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"id":"a01-1234"}' })

      await service.update('a01-1234', {
        status: 'in_progress',
        priority: 0,
        title: 'Updated',
        addLabel: 'urgent',
      })

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        [
          'update', '--actor', 'assistant', 'a01-1234', '--json',
          '--status', 'in_progress',
          '--priority', '0',
          '--title', 'Updated',
          '--add-label', 'urgent',
        ],
        { cwd: '/test/project' },
      )
    })
  })

  describe('close', () => {
    it('should call br close with reason', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"id":"a01-1234","status":"done"}' })

      const result = await service.close('a01-1234', 'Work complete')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['close', '--actor', 'assistant', 'a01-1234', '--json', '--reason', 'Work complete'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual({ id: 'a01-1234', status: 'done' })
    })
  })

  describe('ready', () => {
    it('should call br ready --json', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '[]' })

      await service.ready()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['ready', '--json'],
        { cwd: '/test/project' },
      )
    })
  })

  describe('blocked', () => {
    it('should call br blocked --json', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '[]' })

      await service.blocked()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['blocked', '--json'],
        { cwd: '/test/project' },
      )
    })
  })

  describe('syncFlush', () => {
    it('should call br sync --flush-only', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{}' })

      await service.syncFlush()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['sync', '--flush-only'],
        { cwd: '/test/project' },
      )
    })
  })

  describe('syncImport', () => {
    it('should call br sync --import-only', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{}' })

      await service.syncImport()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'br',
        ['sync', '--import-only'],
        { cwd: '/test/project' },
      )
    })
  })

  describe('error handling', () => {
    it('should wrap errors with context', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('command not found'))

      await expect(service.show('bad-id')).rejects.toThrow(
        'BeadsService command failed [show bad-id --json]: command not found',
      )
    })
  })
})
