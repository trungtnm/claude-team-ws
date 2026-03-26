export type SessionStatus = 'running' | 'idle' | 'waiting_input' | 'completed' | 'failed' | 'cancelled'

export interface SessionQuestion {
  text: string
  options: string[]
  context: string
}

export interface ContextWindowInfo {
  usedPercentage: number
  currentUsage: {
    inputTokens: number
    outputTokens: number
    cacheCreationInputTokens: number
    cacheReadInputTokens: number
  } | null
}

export interface CapabilityItem {
  name: string
  description?: string
}

export interface SessionCapabilities {
  commands: CapabilityItem[]
  agents: CapabilityItem[]
  skills: CapabilityItem[]
  tools: string[]
}

export interface Attachment {
  type: 'image' | 'file'
  name: string
  mimeType: string
  data: string
}
