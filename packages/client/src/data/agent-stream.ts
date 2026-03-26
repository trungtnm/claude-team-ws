import type { Attachment, SessionQuestion } from './sessions'

export interface StreamEvent {
  id: number
  type: 'system' | 'assistant' | 'user_message' | 'tool_use' | 'tool_result' | 'result' | 'error'
  content: string
  toolName?: string
  toolInput?: string
  toolResult?: string
  timestamp: number
  attachments?: Attachment[]
  questionData?: SessionQuestion
}

const now = Math.floor(Date.now() / 1000)
const ago = (seconds: number) => now - seconds

export const streamEvents: StreamEvent[] = [
  { id: 1, type: 'system', content: 'Session started. Model: claude-sonnet-4-6. Project: backend. Branch: epic/search-api', timestamp: ago(720) },
  { id: 2, type: 'user_message', content: 'Implement full-text search across captures and epics using the CASS service wrapper. Make sure to add proper TypeScript types and integration tests.', timestamp: ago(718) },
  { id: 3, type: 'assistant', content: "I'll start by reading the existing CASS service wrapper to understand the current search infrastructure.", timestamp: ago(715) },
  { id: 4, type: 'tool_use', toolName: 'Read', toolInput: 'src/services/cass-service.ts', content: 'Reading existing CASS service...', toolResult: `import { execFile } from 'child_process'\nimport { promisify } from 'util'\n\nconst execFileAsync = promisify(execFile)\n\nexport class CassService {\n  constructor(private projectRoot: string) {}\n\n  async search(query: string) {\n    const { stdout } = await execFileAsync('cass', ['search', '--robot', query], { cwd: this.projectRoot })\n    return JSON.parse(stdout)\n  }\n\n  async index() {\n    const { stdout } = await execFileAsync('cass', ['index'], { cwd: this.projectRoot })\n    return JSON.parse(stdout)\n  }\n}`, timestamp: ago(710) },
  { id: 5, type: 'tool_result', content: '', timestamp: ago(709) },
  { id: 6, type: 'assistant', content: "Good, the CASS service wrapper exists but only has basic search and index methods. I need to add a more sophisticated search method that supports filtering by type (captures vs epics) and returns ranked results. Let me also check the captures and epics route handlers.", timestamp: ago(700) },
  { id: 7, type: 'tool_use', toolName: 'Read', toolInput: 'src/routes/captures.ts', content: 'Reading captures route...', toolResult: "// GET /api/captures - List captures with filtering\nrouter.get('/', authenticate, async (req, res) => {\n  const { project_id, status } = req.query\n  // ... existing implementation\n})", timestamp: ago(695) },
  { id: 8, type: 'tool_result', content: '', timestamp: ago(694) },
  { id: 9, type: 'tool_use', toolName: 'Bash', toolInput: 'cat package.json | grep cass', content: 'Checking if cass types exist...', toolResult: '(no results)', timestamp: ago(688) },
  { id: 10, type: 'tool_result', content: '', timestamp: ago(687) },
  { id: 11, type: 'assistant', content: "No CASS type definitions in the project. I'll create a proper TypeScript interface for CASS search results and extend the service with a unified search endpoint that queries both captures and epics.", timestamp: ago(680) },
  { id: 12, type: 'tool_use', toolName: 'Write', toolInput: 'src/types/search.ts', content: 'Creating search type definitions...', toolResult: 'File created: src/types/search.ts (28 lines)', timestamp: ago(670) },
  { id: 13, type: 'tool_result', content: '', timestamp: ago(669) },
  { id: 14, type: 'tool_use', toolName: 'Edit', toolInput: 'src/services/cass-service.ts', content: 'Extending CASS service with unified search...', toolResult: 'File edited: added unifiedSearch method (+45 lines)', timestamp: ago(655) },
  { id: 15, type: 'tool_result', content: '', timestamp: ago(654) },
  { id: 16, type: 'assistant', content: "Now I'll create the search route that combines results from CASS with local database queries for captures and epics. The route will support query parameters for filtering and pagination.", timestamp: ago(640) },
  { id: 17, type: 'tool_use', toolName: 'Write', toolInput: 'src/routes/search.ts', content: 'Creating search route handler...', toolResult: 'File created: src/routes/search.ts (67 lines)', timestamp: ago(620) },
  { id: 18, type: 'tool_result', content: '', timestamp: ago(619) },
  { id: 19, type: 'tool_use', toolName: 'Edit', toolInput: 'src/index.ts', content: 'Registering search route...', toolResult: "Added: import searchRouter from './routes/search.js'\nAdded: app.use('/api/search', searchRouter)", timestamp: ago(610) },
  { id: 20, type: 'tool_result', content: '', timestamp: ago(609) },
  { id: 21, type: 'assistant', content: "The search route is registered. Let me now write integration tests for the search endpoint to verify filtering, pagination, and result ranking work correctly.", timestamp: ago(600) },
  { id: 22, type: 'tool_use', toolName: 'Write', toolInput: 'src/routes/search.integration.test.ts', content: 'Writing integration tests...', toolResult: 'File created: src/routes/search.integration.test.ts (124 lines)', timestamp: ago(580) },
  { id: 23, type: 'tool_result', content: '', timestamp: ago(579) },
  { id: 24, type: 'tool_use', toolName: 'Bash', toolInput: 'pnpm test -- --run search.integration', content: 'Running search integration tests...', toolResult: '✓ GET /api/search returns captures matching query (23ms)\n✓ GET /api/search returns epics matching query (18ms)\n✓ GET /api/search supports type filter (12ms)\n✓ GET /api/search paginates results (15ms)\n\nTest Files  1 passed\nTests       4 passed', timestamp: ago(560) },
  { id: 25, type: 'tool_result', content: '', timestamp: ago(559) },
  {
    id: 26,
    type: 'tool_use',
    toolName: 'AskUserQuestion',
    toolInput: 'Which cache invalidation strategy should I use?',
    content: 'Asking user about cache strategy...',
    questionData: {
      text: 'Which cache invalidation strategy should I use for the epic list endpoint?',
      options: ['TTL-based (60s expiry)', 'Event-driven (invalidate on mutation)', 'Hybrid (TTL + event invalidation)'],
      context: 'The epic list is queried ~50 times/min across 4 concurrent users. Mutations happen ~5 times/min.',
    },
    timestamp: ago(545),
  },
  { id: 27, type: 'tool_result', content: '', timestamp: ago(544) },
  { id: 28, type: 'assistant', content: "All 4 integration tests pass. Now I need to add the Socket.IO event emission for search indexing -- when new captures or epics are created, we should trigger a re-index. Let me update the capture and epic routes to emit indexing events.", timestamp: ago(540) },
  { id: 29, type: 'tool_use', toolName: 'Edit', toolInput: 'src/routes/captures.ts', content: 'Adding search index event on capture creation...', toolResult: "Added: emitToProject(projectId, 'search:reindex', { type: 'capture' })", timestamp: ago(530) },
  { id: 30, type: 'tool_result', content: '', timestamp: ago(529) },
  { id: 31, type: 'assistant', content: "Search API integration is progressing well. Next steps: add the frontend search bar component with Cmd+K shortcut and instant results dropdown.", timestamp: ago(520) },
]
