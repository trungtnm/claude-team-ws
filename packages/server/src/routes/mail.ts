import { Router, type Router as RouterType } from 'express'
import { authenticate } from '../middleware/auth.js'
import { agentMailClient } from '../services/agent-mail-client.js'

const router: RouterType = Router({ mergeParams: true })
router.use(authenticate)

// ── GET /api/projects/:projectId/mail/threads ────────────
// List message threads for the project (proxies to Agent Mail)

router.get('/threads', async (req, res) => {
  try {
    const { projectId } = req.params as Record<string, string>
    const projectRoot = req.query.project_root as string | undefined

    if (!projectRoot) {
      res.status(400).json({ error: 'project_root query parameter required' })
      return
    }

    const result = await agentMailClient.fetchInbox(projectRoot, 'system', 50)
    res.json({ threads: result })
  } catch (err) {
    res.status(500).json({ error: `Failed to list threads: ${(err as Error).message}` })
  }
})

// ── GET /api/projects/:projectId/mail/threads/:threadId ──
// Thread detail with messages

router.get('/threads/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params as Record<string, string>
    const projectRoot = req.query.project_root as string | undefined

    if (!projectRoot) {
      res.status(400).json({ error: 'project_root query parameter required' })
      return
    }

    // Search for messages in the thread via Agent Mail search
    const allMessages = await agentMailClient.searchMessages(projectRoot, threadId)
    res.json({ thread_id: threadId, messages: allMessages })
  } catch (err) {
    res.status(500).json({ error: `Failed to get thread: ${(err as Error).message}` })
  }
})

export default router
