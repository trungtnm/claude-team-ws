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

import BvService from './bv-service.js'

describe('BvService', () => {
  let service: BvService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new BvService('/test/project')
  })

  describe('robotPlan', () => {
    it('should call bv --robot-plan', async () => {
      const plan = { tracks: [{ id: 1, beads: [] }] }
      mockExecFileAsync.mockResolvedValue({ stdout: JSON.stringify(plan) })

      const result = await service.robotPlan()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'bv',
        ['--robot-plan'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual(plan)
    })
  })

  describe('robotTriage', () => {
    it('should call bv --robot-triage', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"items":[]}' })

      const result = await service.robotTriage()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'bv',
        ['--robot-triage'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual({ items: [] })
    })
  })

  describe('robotNext', () => {
    it('should call bv --robot-next', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"bead":"a01-1234"}' })

      const result = await service.robotNext()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'bv',
        ['--robot-next'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual({ bead: 'a01-1234' })
    })
  })

  describe('robotInsights', () => {
    it('should call bv --robot-insights', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"insights":[]}' })

      const result = await service.robotInsights()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'bv',
        ['--robot-insights'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual({ insights: [] })
    })
  })

  describe('robotAlerts', () => {
    it('should call bv --robot-alerts', async () => {
      mockExecFileAsync.mockResolvedValue({ stdout: '{"alerts":[]}' })

      const result = await service.robotAlerts()

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'bv',
        ['--robot-alerts'],
        { cwd: '/test/project' },
      )
      expect(result).toEqual({ alerts: [] })
    })
  })

  describe('error handling', () => {
    it('should wrap errors with context', async () => {
      mockExecFileAsync.mockRejectedValue(new Error('bv not found'))

      await expect(service.robotPlan()).rejects.toThrow(
        'BvService command failed [--robot-plan]: bv not found',
      )
    })
  })
})
