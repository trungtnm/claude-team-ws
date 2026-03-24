import { Router, type Router as RouterType } from 'express'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const router: RouterType = Router()

/**
 * GET /api/health — no auth required.
 * Returns server status and checks CLI tool availability.
 */
router.get('/', async (_req, res) => {
  const tools = ['claude', 'br', 'bv', 'cass', 'gh', 'git']
  const checks: Record<string, boolean> = {}

  for (const tool of tools) {
    try {
      await execFileAsync('which', [tool])
      checks[tool] = true
    } catch {
      checks[tool] = false
    }
  }

  const dockerServices: Record<string, boolean> = {}
  const agentMailUrl = process.env.AGENT_MAIL_URL || 'http://127.0.0.1:8765/mcp/'
  const cmUrl = process.env.CM_URL || 'http://127.0.0.1:9900'

  try {
    await fetch(agentMailUrl)
    dockerServices.agent_mail = true
  } catch {
    dockerServices.agent_mail = false
  }

  try {
    await fetch(`${cmUrl}/health`)
    dockerServices.cm = true
  } catch {
    dockerServices.cm = false
  }

  const allToolsOk = Object.values(checks).every(Boolean)

  res.json({
    status: allToolsOk ? 'ok' : 'degraded',
    service: 'ctw-server',
    timestamp: Date.now(),
    cli_tools: checks,
    docker_services: dockerServices,
  })
})

export default router
