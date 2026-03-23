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

import CassService from './cass-service.js'

describe('CassService', () => {
  let service: CassService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new CassService('/test/project')
  })

  describe('search', () => {
    it('should call cass search --robot with query', async () => {
      const results = { matches: [{ file: 'test.ts', score: 0.9 }] }
      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(results) })

      const result = await service.search('authentication logic')

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'cass',
        ['search', '--robot', 'authentication logic'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual(results)
    })
  })

  describe('index', () => {
    it('should call cass index', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"indexed":42}' })

      const result = await service.index()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'cass',
        ['index'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual({ indexed: 42 })
    })
  })

  describe('error handling', () => {
    it('should wrap errors with context', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('timeout'))

      await expect(service.search('test')).rejects.toThrow(
        'CassService command failed [search --robot test]: timeout',
      )
    })
  })
})
