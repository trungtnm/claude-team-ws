export interface KnowledgeRule {
  id: string
  ruleText: string
  category: 'coding' | 'security' | 'testing' | 'architecture' | 'general'
  confidence: number
  maturity: 'candidate' | 'established' | 'proven' | 'deprecated'
  source: 'manual' | 'auto'
  helpfulCount: number
  harmfulCount: number
  createdAt: number
}

const now = Math.floor(Date.now() / 1000)

export const rules: KnowledgeRule[] = [
  {
    id: 'rule-1', ruleText: 'Always use execFile instead of exec for CLI wrappers to prevent shell injection.',
    category: 'security', confidence: 0.95, maturity: 'proven', source: 'manual', helpfulCount: 12, harmfulCount: 0, createdAt: now - 1209600,
  },
  {
    id: 'rule-2', ruleText: 'Use zod .safeParse() for all request validation. Return 400 with parsed.error.issues on failure.',
    category: 'coding', confidence: 0.9, maturity: 'proven', source: 'manual', helpfulCount: 8, harmfulCount: 0, createdAt: now - 1209600,
  },
  {
    id: 'rule-3', ruleText: 'Every mutation route MUST emit Socket.IO events to the relevant room.',
    category: 'architecture', confidence: 0.88, maturity: 'established', source: 'manual', helpfulCount: 6, harmfulCount: 1, createdAt: now - 864000,
  },
  {
    id: 'rule-4', ruleText: 'Integration tests should use createTestDb() for in-memory SQLite — never the production database.',
    category: 'testing', confidence: 0.85, maturity: 'established', source: 'auto', helpfulCount: 5, harmfulCount: 0, createdAt: now - 604800,
  },
  {
    id: 'rule-5', ruleText: 'Prefer TanStack Query for all server state. Do not use useState + fetch patterns.',
    category: 'coding', confidence: 0.75, maturity: 'candidate', source: 'auto', helpfulCount: 3, harmfulCount: 1, createdAt: now - 432000,
  },
  {
    id: 'rule-6', ruleText: 'Never query .beads/beads.db directly. Always use br CLI via BeadsService.',
    category: 'architecture', confidence: 0.92, maturity: 'proven', source: 'manual', helpfulCount: 7, harmfulCount: 0, createdAt: now - 1209600,
  },
]

export const categoryColors: Record<string, string> = {
  coding: 'text-blue-400 bg-blue-400/10',
  security: 'text-red-400 bg-red-400/10',
  testing: 'text-green-400 bg-green-400/10',
  architecture: 'text-purple-400 bg-purple-400/10',
  general: 'text-gray-400 bg-gray-400/10',
}

export const maturityColors: Record<string, string> = {
  candidate: 'text-yellow-400 bg-yellow-400/10',
  established: 'text-blue-400 bg-blue-400/10',
  proven: 'text-green-400 bg-green-400/10',
  deprecated: 'text-red-400 bg-red-400/10',
}
