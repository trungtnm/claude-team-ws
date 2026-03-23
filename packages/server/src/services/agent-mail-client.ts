interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: Record<string, unknown>
}

class AgentMailClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl
    this.token = token
  }

  async registerAgent(project: string, model: string, agentName: string): Promise<any> {
    return this.rpc('register_agent', {
      project,
      model,
      agent_name: agentName,
    })
  }

  async sendMessage(threadId: string, subject: string, body: string): Promise<any> {
    return this.rpc('send_message', {
      thread_id: threadId,
      subject,
      body,
    })
  }

  async fetchInbox(agentName: string): Promise<any> {
    return this.rpc('fetch_inbox', {
      agent_name: agentName,
    })
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/mcp/`, {
        method: 'GET',
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<any> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }

    try {
      const response = await fetch(`${this.baseUrl}/mcp/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
        },
        body: JSON.stringify(request),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('HTTP ')) {
        throw new Error(`AgentMailClient request failed [${method}]: ${error.message}`)
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`AgentMailClient request failed [${method}]: ${message}`)
    }
  }
}

export default AgentMailClient
