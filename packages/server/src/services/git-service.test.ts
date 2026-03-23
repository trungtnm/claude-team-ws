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

import GitService from './git-service.js'

describe('GitService', () => {
  let service: GitService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new GitService('/test/repo')
  })

  describe('checkout', () => {
    it('should call git checkout with branch name', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.checkout('feature/test')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['checkout', 'feature/test'],
        { cwd: '/test/repo' },
      )
    })
  })

  describe('checkoutNew', () => {
    it('should call git checkout -b with branch name', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.checkoutNew('feature/new')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/new'],
        { cwd: '/test/repo' },
      )
    })
  })

  describe('pull', () => {
    it('should default to origin main', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.pull()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['pull', 'origin', 'main'],
        { cwd: '/test/repo' },
      )
    })

    it('should use custom remote and branch', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.pull('upstream', 'develop')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['pull', 'upstream', 'develop'],
        { cwd: '/test/repo' },
      )
    })
  })

  describe('push', () => {
    it('should default to origin main without upstream', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.push()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['push', 'origin', 'main'],
        { cwd: '/test/repo' },
      )
    })

    it('should add -u flag when setUpstream is true', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.push('origin', 'feature/x', true)

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['push', '-u', 'origin', 'feature/x'],
        { cwd: '/test/repo' },
      )
    })
  })

  describe('currentBranch', () => {
    it('should return trimmed branch name', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: 'main\n' })

      const branch = await service.currentBranch()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        { cwd: '/test/repo' },
      )
      expect(branch).toBe('main')
    })
  })

  describe('hasCommitsAhead', () => {
    it('should return true when there are commits ahead', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '3\n' })

      const result = await service.hasCommitsAhead('main')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['rev-list', '--count', 'main..HEAD'],
        { cwd: '/test/repo' },
      )
      expect(result).toBe(true)
    })

    it('should return false when there are no commits ahead', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '0\n' })

      const result = await service.hasCommitsAhead('main')

      expect(result).toBe(false)
    })
  })

  describe('deleteBranch', () => {
    it('should call git branch -d', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '' })

      await service.deleteBranch('feature/old')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'git',
        ['branch', '-d', 'feature/old'],
        { cwd: '/test/repo' },
      )
    })
  })

  describe('error handling', () => {
    it('should wrap errors with context', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('not a git repository'))

      await expect(service.currentBranch()).rejects.toThrow(
        'GitService command failed [rev-parse --abbrev-ref HEAD]: not a git repository',
      )
    })
  })
})
