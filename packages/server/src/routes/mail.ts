import { Router, type Router as RouterType } from 'express'
import { authenticate } from '../middleware/auth.js'
import { logError } from '../utils/log-error.js'

// Mounted at /api/mail
const router: RouterType = Router()

router.use(authenticate)

const AGENT_MAIL_URL = process.env.AGENT_MAIL_URL || 'http://127.0.0.1:8765'

// GET /threads — proxy to Agent Mail
router.get('/threads', async (req, res) => {
  try {
    const params = new URLSearchParams()
    if (req.query.project) params.set('project', req.query.project as string)
    if (req.query.limit) params.set('limit', req.query.limit as string)

    const url = `${AGENT_MAIL_URL}/api/threads?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      res.status(response.status).json({ error: `Agent Mail returned ${response.status}` })
      return
    }

    const data = await response.json()
    res.json(data)
  } catch (err) {
      res.status(502).json({ error: logError('mail', err) })
  }
})

// GET /threads/:threadId — proxy to Agent Mail
router.get('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params
    const params = new URLSearchParams()
    if (req.query.include_bodies) params.set('include_bodies', req.query.include_bodies as string)

    const url = `${AGENT_MAIL_URL}/api/threads/${encodeURIComponent(threadId)}?${params.toString()}`
    const response = await fetch(url)

    if (!response.ok) {
      res.status(response.status).json({ error: `Agent Mail returned ${response.status}` })
      return
    }

    const data = await response.json()
    res.json(data)
  } catch (err) {
      res.status(502).json({ error: logError('mail', err) })
  }
})

export default router
