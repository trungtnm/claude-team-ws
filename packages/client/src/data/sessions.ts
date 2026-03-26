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

export interface AgentSession {
  id: string
  name: string
  prompt: string
  model: 'sonnet' | 'opus' | 'haiku'
  targetDir: string
  permissionMode: string
  status: SessionStatus
  startedAt: number
  finishedAt?: number
  question?: SessionQuestion
  turns: number
  filesModified: number
  lastAction: string
  duration: number
  tokensUsed?: number
  costUsd?: number
  contextWindow?: ContextWindowInfo
  capabilities?: SessionCapabilities
}

const now = Math.floor(Date.now() / 1000)

const mockCapabilities: SessionCapabilities = {
  commands: [
    { name: 'help', description: 'Show available commands' },
    { name: 'clear', description: 'Clear conversation history' },
    { name: 'compact', description: 'Summarize and compact context' },
    { name: 'init', description: 'Initialize project configuration' },
    { name: 'review', description: 'Review code changes' },
    { name: 'commit', description: 'Create a git commit' },
    { name: 'pr', description: 'Create or manage pull requests' },
    { name: 'test', description: 'Run project tests' },
    { name: 'lint', description: 'Run linter on project files' },
    { name: 'status', description: 'Show project status' },
  ],
  agents: [
    { name: 'Orchestrator', description: 'Coordinates multi-agent workflows' },
    { name: 'Reviewer', description: 'Reviews code for quality and bugs' },
    { name: 'Planner', description: 'Creates implementation plans' },
    { name: 'Researcher', description: 'Searches documentation and codebase' },
    { name: 'Tester', description: 'Generates and runs tests' },
  ],
  skills: [
    { name: 'commit', description: 'Stage and commit changes with message' },
    { name: 'pr', description: 'Create pull request from branch' },
    { name: 'review-pr', description: 'Review an open pull request' },
    { name: 'edit-file', description: 'Make targeted file edits' },
    { name: 'search', description: 'Search codebase with ripgrep' },
    { name: 'explain', description: 'Explain code or architecture' },
    { name: 'refactor', description: 'Refactor code for quality' },
    { name: 'debug', description: 'Debug failing tests or errors' },
    { name: 'docs', description: 'Generate or update documentation' },
    { name: 'deploy', description: 'Deploy to staging or production' },
  ],
  tools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch', 'TodoWrite', 'AskUserQuestion'],
}

export const sessions: AgentSession[] = [
  // Running with contextWindow data
  {
    id: 'ses-1',
    name: 'Implement full-text search across',
    prompt: 'Implement full-text search across captures and epics using CASS service wrapper.',
    model: 'sonnet',
    targetDir: '/Users/dev/project',
    permissionMode: 'acceptEdits',
    status: 'running',
    startedAt: now - 723,
    turns: 18,
    filesModified: 4,
    lastAction: 'Edit src/services/cass-service.ts',
    duration: 723,
    tokensUsed: 45200,
    costUsd: 0.12,
    contextWindow: {
      usedPercentage: 23,
      currentUsage: {
        inputTokens: 34000,
        outputTokens: 11200,
        cacheCreationInputTokens: 8000,
        cacheReadInputTokens: 12000,
      },
    },
    capabilities: mockCapabilities,
  },
  // Running without contextWindow
  {
    id: 'ses-3',
    name: 'Migrate authentication from API',
    prompt: 'Migrate authentication from API key to OAuth 2.0 with GitHub SSO.',
    model: 'sonnet',
    targetDir: '/Users/dev/project',
    permissionMode: 'default',
    status: 'running',
    startedAt: now - 1520,
    turns: 34,
    filesModified: 8,
    lastAction: 'Edit src/middleware/auth.ts',
    duration: 1520,
    tokensUsed: 112000,
    costUsd: 0.31,
    capabilities: mockCapabilities,
  },
  // Idle
  {
    id: 'ses-8',
    name: 'Waiting for instructions',
    prompt: 'Ready for new tasks.',
    model: 'haiku',
    targetDir: '/Users/dev/project',
    permissionMode: 'default',
    status: 'idle',
    startedAt: now - 300,
    turns: 5,
    filesModified: 1,
    lastAction: 'Completed previous task',
    duration: 300,
    tokensUsed: 8200,
    costUsd: 0.02,
    capabilities: mockCapabilities,
  },
  // Waiting input with question
  {
    id: 'ses-2',
    name: 'Add Redis caching for',
    prompt: 'Add Redis caching for epic lists and graph data.',
    model: 'opus',
    targetDir: '/Users/dev/project',
    permissionMode: 'default',
    status: 'waiting_input',
    startedAt: now - 485,
    turns: 12,
    filesModified: 2,
    lastAction: 'Read docker-compose.yml',
    duration: 485,
    tokensUsed: 78400,
    costUsd: 0.45,
    question: {
      text: 'Which cache invalidation strategy should I use for the epic list endpoint?',
      options: ['TTL-based (60s expiry)', 'Event-driven (invalidate on mutation)', 'Hybrid (TTL + event invalidation)'],
      context: 'The epic list is queried ~50 times/min across 4 concurrent users. Mutations happen ~5 times/min.',
    },
    contextWindow: {
      usedPercentage: 39,
      currentUsage: {
        inputTokens: 56000,
        outputTokens: 22400,
        cacheCreationInputTokens: 15000,
        cacheReadInputTokens: 6000,
      },
    },
    capabilities: mockCapabilities,
  },
  // Completed
  {
    id: 'ses-5',
    name: 'Build drag-and-drop Kanban board',
    prompt: 'Build drag-and-drop Kanban board with dnd-kit for epic management.',
    model: 'sonnet',
    targetDir: '/Users/dev/project',
    permissionMode: 'bypassPermissions',
    status: 'completed',
    startedAt: now - 172800,
    finishedAt: now - 172800 + 2340,
    turns: 45,
    filesModified: 12,
    lastAction: 'Write e2e/board.spec.ts',
    duration: 2340,
    tokensUsed: 156000,
    costUsd: 0.42,
  },
  {
    id: 'ses-6',
    name: 'Redesign login page with',
    prompt: 'Redesign login page with GitHub SSO, API key fallback, and remember me.',
    model: 'opus',
    targetDir: '/Users/dev/project',
    permissionMode: 'default',
    status: 'completed',
    startedAt: now - 86400,
    finishedAt: now - 86400 + 1680,
    turns: 28,
    filesModified: 6,
    lastAction: 'Edit src/pages/login-page.tsx',
    duration: 1680,
    tokensUsed: 98000,
    costUsd: 0.89,
  },
  // Failed
  {
    id: 'ses-7',
    name: 'Add repos, agent_queue, knowledge_rules',
    prompt: 'Add repos, agent_queue, knowledge_rules tables to the schema.',
    model: 'sonnet',
    targetDir: '/Users/dev/project',
    permissionMode: 'default',
    status: 'failed',
    startedAt: now - 259200,
    finishedAt: now - 259200 + 420,
    turns: 8,
    filesModified: 2,
    lastAction: 'Bash: pnpm db:migrate',
    duration: 420,
    tokensUsed: 23000,
    costUsd: 0.06,
  },
]

export function getSessionsByStatus(status: SessionStatus): AgentSession[] {
  return sessions.filter((s) => s.status === status)
}

export function getWaitingSessions(): AgentSession[] {
  return sessions.filter((s) => s.status === 'waiting_input')
}
