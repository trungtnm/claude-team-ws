// ─── Server → Client Events ──────────────────────────────────────────────────

export interface CaptureCreatedEvent {
  capture: {
    id: string
    text: string
    status: 'pending'
    user: { id: string; name: string; avatarUrl: string | null }
    createdAt: number
  }
}

export interface EpicCreatedEvent {
  epic: {
    id: string
    beadEpicId: string
    uiStatus: string
    bead: { title: string; priority: number; type: string }
    createdBy: { id: string; name: string }
  }
}

export interface EpicUpdatedEvent {
  epic: {
    id: string
    beadEpicId: string
    uiStatus: string
    prevStatus: string
    bead: Record<string, unknown>
  }
  trigger: 'user' | 'agent' | 'system'
}

export interface SessionLifecycleEvent {
  session: {
    id: string
    epicId: string | null
    status: 'running' | 'completed' | 'failed' | 'cancelled'
    user: { id: string; name: string }
    agentMailName: string | null
    model: string
  }
  event: 'started' | 'completed' | 'failed' | 'cancelled'
}

export interface SessionEventData {
  sessionId: string
  eventId: number
  eventType: 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'
  data: Record<string, unknown>
  timestamp: number
}

export interface SessionQuestionEvent {
  sessionId: string
  question: {
    id: string
    text: string
    options: Array<{ label: string; description: string }> | null
    context: string
  }
  mode: 'pause' | 'auto' | 'hybrid'
  riskLevel: 'low' | 'high'
  autoAnswer: string | null
  timeoutSeconds: number | null
}

export interface SessionProgressEvent {
  sessionId: string
  progress: {
    turns: number
    toolsUsed: number
    filesModified: number
    elapsedMs: number
    lastTool: string
  }
}

export interface PrEventData {
  pr: {
    url: string
    title: string
    status: 'created' | 'review_complete' | 'changes_requested' | 'approved' | 'merged'
    epicId: string
    sessionId: string
  }
}

export interface NotificationEvent {
  notification: {
    id: string
    type: 'agent_complete' | 'pr_ready' | 'review_needed' | 'question_waiting' | 'merge_complete'
    title: string
    body: string | null
    link: string | null
    projectId: string
  }
}

export interface QueueUpdatedEvent {
  queue: {
    length: number
    items: Array<{
      id: string
      epicTitle: string
      priority: number
      position: number
      user: { name: string }
    }>
  }
}

export interface BeadsChangedEvent {
  timestamp: number
  hint: 'refetch_board' | 'refetch_graph'
}

export interface BeadsSyncConflictEvent {
  error: string
  details: string
  actionRequired: string
  hostCommand: string
  timestamp: number
}

export interface BeadsSyncResolvedEvent {
  timestamp: number
}

// ─── Client → Server Events ──────────────────────────────────────────────────

export interface JoinProjectPayload {
  projectId: string
}

export interface JoinSessionPayload {
  sessionId: string
}

export interface LeaveSessionPayload {
  sessionId: string
}

export interface SessionAnswerPayload {
  sessionId: string
  questionId: string
  answer: string
}

export interface SessionCancelPayload {
  sessionId: string
}

export interface CaptureCreatePayload {
  projectId: string
  text: string
}
