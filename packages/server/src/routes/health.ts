import { Router } from 'express'
import type { Request, Response } from 'express'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)
const router = Router()

interface ToolStatus {
  name: string
  available: boolean
  version?: string
  error?: string
}

interface ServiceStatus {
  name: string
  reachable: boolean
  error?: string
}

async function checkTool(name: string): Promise<ToolStatus> {
  try {
    const { stdout } = await execFile('which', [name])
    return { name, available: true, version: stdout.trim() }
  } catch {
    return { name, available: false, error: 'Không tìm thấy' }
  }
}

async function checkService(name: string, url: string): Promise<ServiceStatus> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(url, { signal: controller.signal })
    clearTimeout(timeoutId)
    return { name, reachable: response.ok }
  } catch (error) {
    return {
      name,
      reachable: false,
      error: error instanceof Error ? error.message : 'Không thể kết nối',
    }
  }
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const cliTools = ['claude', 'br', 'bv', 'cass', 'gh', 'git']
    const toolChecks = await Promise.all(cliTools.map(checkTool))

    const services = [
      { name: 'agent-mail', url: process.env.AGENT_MAIL_URL || 'http://localhost:4100/health' },
      { name: 'context-manager', url: process.env.CM_URL || 'http://localhost:4200/health' },
    ]
    const serviceChecks = await Promise.all(
      services.map((s) => checkService(s.name, s.url)),
    )

    const allToolsAvailable = toolChecks.every((t) => t.available)
    const allServicesReachable = serviceChecks.every((s) => s.reachable)

    res.json({
      status: allToolsAvailable && allServicesReachable ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      tools: toolChecks,
      services: serviceChecks,
    })
  } catch (error) {
    console.error('Lỗi kiểm tra sức khoẻ:', error)
    res.status(500).json({ error: 'Lỗi máy chủ nội bộ' })
  }
})

export default router
