class CmClient {
  private readonly baseUrl: string

  constructor(baseUrl = 'http://127.0.0.1:9900') {
    this.baseUrl = baseUrl
  }

  async getContext(description: string): Promise<any> {
    return this.post('context', { description })
  }

  async recordOutcome(
    sessionId: string,
    result: 'success' | 'failure',
    details?: string,
  ): Promise<any> {
    const body: Record<string, unknown> = {
      session_id: sessionId,
      result,
    }
    if (details !== undefined) {
      body.details = details
    }
    return this.post('outcome', body)
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
      })
      return response.ok
    } catch {
      return false
    }
  }

  private async post(path: string, body: Record<string, unknown>): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      return await response.json()
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('HTTP ')) {
        throw new Error(`CmClient request failed [${path}]: ${error.message}`)
      }
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`CmClient request failed [${path}]: ${message}`)
    }
  }
}

export default CmClient
