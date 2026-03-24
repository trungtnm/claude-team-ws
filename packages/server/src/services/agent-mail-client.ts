/**
 * HTTP client for Agent Mail MCP server (Docker container on port 8765).
 * Uses JSON-RPC 2.0 protocol over HTTP.
 */

const AGENT_MAIL_URL = process.env.AGENT_MAIL_URL || 'http://127.0.0.1:8765/mcp/'
const AGENT_MAIL_TOKEN = process.env.MCP_AGENT_MAIL_TOKEN || ''

let rpcId = 0

async function rpcCall(method: string, toolName: string, args: Record<string, unknown>): Promise<unknown> {
  const body = {
    jsonrpc: '2.0',
    id: String(++rpcId),
    method,
    params: { name: toolName, arguments: args },
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (AGENT_MAIL_TOKEN) {
    headers['Authorization'] = `Bearer ${AGENT_MAIL_TOKEN}`
  }

  const response = await fetch(AGENT_MAIL_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`AgentMailClient.${toolName} failed: HTTP ${response.status}`)
  }

  const data = await response.json() as {
    result?: { content?: Array<{ text: string }> }
    error?: { message: string }
  }

  if (data.error) {
    throw new Error(`AgentMailClient.${toolName} failed: ${data.error.message}`)
  }

  const text = data.result?.content?.[0]?.text
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export const agentMailClient = {
  /** Check if Agent Mail server is reachable */
  async health(): Promise<boolean> {
    try {
      await rpcCall('tools/call', 'health_check', {})
      return true
    } catch {
      return false
    }
  },

  /** Ensure project exists in Agent Mail */
  async ensureProject(projectKey: string): Promise<unknown> {
    return rpcCall('tools/call', 'ensure_project', { human_key: projectKey })
  },

  /** Register an agent in the project */
  async registerAgent(
    projectKey: string,
    model: string,
    taskDescription: string,
    name?: string,
  ): Promise<unknown> {
    return rpcCall('tools/call', 'register_agent', {
      project_key: projectKey,
      program: 'claude-code',
      model,
      task_description: taskDescription,
      ...(name ? { name } : {}),
    })
  },

  /** Send a message to other agents */
  async sendMessage(
    projectKey: string,
    senderName: string,
    to: string[],
    subject: string,
    bodyMd: string,
    threadId?: string,
  ): Promise<unknown> {
    return rpcCall('tools/call', 'send_message', {
      project_key: projectKey,
      sender_name: senderName,
      to,
      subject,
      body_md: bodyMd,
      ...(threadId ? { thread_id: threadId } : {}),
    })
  },

  /** Fetch inbox for an agent */
  async fetchInbox(
    projectKey: string,
    agentName: string,
    limit = 20,
  ): Promise<unknown> {
    return rpcCall('tools/call', 'fetch_inbox', {
      project_key: projectKey,
      agent_name: agentName,
      limit,
      include_bodies: true,
    })
  },

  /** Search messages by query (FTS5) */
  async searchMessages(
    projectKey: string,
    query: string,
    limit = 50,
  ): Promise<unknown> {
    return rpcCall('tools/call', 'search_messages', {
      project_key: projectKey,
      query,
      limit,
    })
  },

  /** Reserve files for an agent to prevent conflicts */
  async fileReservation(
    projectKey: string,
    agentName: string,
    paths: string[],
    ttlSeconds = 3600,
    exclusive = true,
  ): Promise<unknown> {
    return rpcCall('tools/call', 'file_reservation_paths', {
      project_key: projectKey,
      agent_name: agentName,
      paths,
      ttl_seconds: ttlSeconds,
      exclusive,
    })
  },
}
