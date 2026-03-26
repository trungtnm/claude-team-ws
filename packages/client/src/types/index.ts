// ─── Enums / Unions ──────────────────────────────────────────────────────────

export type UserRole = 'pm' | 'dev' | 'techlead' | 'viewer'

export type UiStatus = 'blocked' | 'ready' | 'in_progress' | 'in_review' | 'done' | 'cancelled'

export type SessionStatus =
  | 'queued'
  | 'running'
  | 'waiting_input'
  | 'validation_failed'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'detached'

export type SessionEventType = 'system' | 'assistant' | 'tool_use' | 'tool_result' | 'result' | 'error'

export type NotificationType =
  | 'agent_complete'
  | 'pr_ready'
  | 'review_needed'
  | 'question_waiting'
  | 'merge_complete'

export type RuleCategory = 'coding' | 'security' | 'testing' | 'architecture' | 'general'

export type RuleMaturity = 'candidate' | 'established' | 'proven' | 'deprecated'

export type AskQuestionMode = 'pause' | 'auto' | 'hybrid'

// ─── Domain Types ────────────────────────────────────────────────────────────

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatarUrl: string | null
  apiKey?: string
  createdAt: number
  updatedAt: number
  // Computed fields (not in DB, calculated in API response)
  initials?: string
  color?: string
}

export interface Project {
  id: string
  name: string
  slug: string
  projectRoot: string
  maxConcurrentAgents: number
  askQuestionMode: AskQuestionMode
  createdAt: number
  updatedAt: number
}

export interface Repo {
  id: string
  projectId: string
  name: string
  gitUrl: string | null
  path: string
  defaultBranch: string
  linkMode: 'clone' | 'symlink'
  status: 'cloning' | 'ready' | 'error'
  addedBy: string
  createdAt: number
}

export interface Member {
  userId: string
  roleOverride: string | null
  createdAt: number
  name: string
  email: string
  role: UserRole
  avatarUrl: string | null
}

export interface Capture {
  id: string
  projectId: string
  userId: string
  text: string
  status: 'pending' | 'triaged' | 'deferred' | 'dismissed'
  triageResult: string | null
  createdAt: number
  triagedAt: number | null
  triagedBy: string | null
  // Denormalized
  user?: Pick<User, 'id' | 'name' | 'avatarUrl'>
}

export interface Epic {
  id: string
  projectId: string
  beadEpicId: string
  gitBranches: string[]
  uiStatus: UiStatus
  scopeAnalysis: ScopeAnalysis | null
  splitProposal: unknown | null
  createdAt: number
  updatedAt: number
  // Denormalized from bead
  bead?: {
    title: string
    description: string
    priority: number
    type: string
    status: string
    labels: string[]
  }
  activeSession?: Pick<AgentSession, 'id' | 'status' | 'model'> | null
  prUrl?: string | null
  prStatus?: string | null
}

export interface AgentSession {
  id: string
  projectId: string
  epicId: string | null
  userId: string
  claudeSessionId: string | null
  agentMailName: string | null
  model: string
  status: SessionStatus
  prompt: string
  pid: number | null
  exitCode: number | null
  prUrl: string | null
  prStatus: string | null
  startedAt: number | null
  finishedAt: number | null
  createdAt: number
  // Denormalized
  epic?: Pick<Epic, 'id' | 'beadEpicId'> & { bead?: { title: string } }
  user?: Pick<User, 'id' | 'name' | 'avatarUrl'>
  queuePosition?: number | null
}

export interface SessionEvent {
  id: number
  sessionId: string
  eventType: SessionEventType
  data: string
  createdAt: number
}

export interface Notification {
  id: string
  userId: string
  projectId: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read: boolean
  createdAt: number
}

export interface KnowledgeRule {
  id: string
  projectId: string
  ruleText: string
  category: RuleCategory
  confidence: number
  maturity: RuleMaturity
  source: 'manual' | 'auto'
  sourceSessionId: string | null
  approvedBy: string | null
  helpfulCount: number
  harmfulCount: number
  lastValidatedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface WebhookConfig {
  id: string
  projectId: string
  type: 'slack' | 'discord' | 'telegram'
  url: string
  events: string[]
  enabled: boolean
  createdAt: number
}

export interface ScopeAnalysis {
  estimatedTokens: number
  filesAffected: number
  complexity: 'low' | 'medium' | 'high'
  recommendation: 'single' | 'split'
  proposedBeads?: Array<{ title: string; priority: number; description: string }>
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface GraphNode {
  id: string
  title: string
  status: string
  priority: number
  type: string
  assignee?: string
}

export interface GraphEdge {
  source: string
  target: string
  type: 'blocks'
}

// ─── PR Review Types (match component data shape) ────────────────────────────

export interface PrFile {
  path: string
  additions: number
  deletions: number
  oldCode: string
  newCode: string
}

export interface SecurityWarning {
  severity: 'high' | 'medium' | 'low'
  message: string
  file: string
  line: number
}

export interface PrComment {
  id: string
  author: string
  authorInitials: string
  text: string
  createdAt: number
}

export interface PrReviewAiData {
  ubsPass: boolean
  ubsIssues: number
  securityWarnings: SecurityWarning[]
  standardsPass: boolean
  verdict: string
}

export interface PrReviewData {
  sessionId: string
  prNumber: number
  title: string
  branch: string
  baseBranch: string
  epicTitle: string
  agentName: string
  files: PrFile[]
  aiReview: PrReviewAiData
  comments: PrComment[]
}

/** Raw API response shape from GET /reviews/:sessionId */
export interface PrReviewApiResponse {
  review: {
    session: AgentSession
    pr: Record<string, unknown> | null
    diff: string | null
  }
}
