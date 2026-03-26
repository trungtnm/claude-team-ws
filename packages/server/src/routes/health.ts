import { Router, type Router as RouterType } from 'express'
import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'
import { authenticate, requireRole } from '../middleware/auth.js'

const execFileAsync = promisify(execFileCb)

const router: RouterType = Router()

// Public health check — minimal, no infrastructure details
router.get('/', (_req, res) => {
  res.json({ status: 'ok' })
})

// Authenticated diagnostics — detailed infrastructure info (techlead only)
router.get('/diagnostics', authenticate, requireRole('techlead'), async (_req, res) => {
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
    dockerServices.agentMail = true
  } catch {
    dockerServices.agentMail = false
  }

  try {
    await fetch(`${cmUrl}/health`)
    dockerServices.cm = true
  } catch {
    dockerServices.cm = false
  }

  res.json({
    status: 'ok',
    cliTools: checks,
    dockerServices,
    uptime: process.uptime(),
  })
})

export default router
