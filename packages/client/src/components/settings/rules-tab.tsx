import { useState, useMemo, useCallback } from 'react'
import { ThumbsUp, ThumbsDown, Plus, Search, Pencil, FlaskConical, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { useRules, useCreateRule, useUpdateRule } from '@/hooks/use-settings'
import type { KnowledgeRule, RuleCategory, RuleMaturity } from '@/types'

const categoryColors: Record<string, string> = {
  coding: 'text-blue-400 bg-blue-400/10',
  security: 'text-red-400 bg-red-400/10',
  testing: 'text-green-400 bg-green-400/10',
  architecture: 'text-purple-400 bg-purple-400/10',
  general: 'text-gray-400 bg-gray-400/10',
}

const maturityColors: Record<string, string> = {
  candidate: 'text-yellow-400 bg-yellow-400/10',
  established: 'text-blue-400 bg-blue-400/10',
  proven: 'text-green-400 bg-green-400/10',
  deprecated: 'text-red-400 bg-red-400/10',
}

const allCategories = ['coding', 'security', 'testing', 'architecture', 'general'] as const
const allMaturities = ['candidate', 'established', 'proven', 'deprecated'] as const

function getConfidenceColor(confidence: number): string {
  if (confidence > 0.8) return 'bg-green-400'
  if (confidence > 0.6) return 'bg-yellow-400'
  return 'bg-red-400'
}

// Simulated AI improvements for demo
const aiImprovements: Record<string, { improved: string; category: RuleCategory; explanation: string }> = {
  default: {
    improved: 'Always use `execFile` instead of `exec` for CLI wrappers to prevent shell injection vulnerabilities. Pass arguments as an array, never concatenate into a command string.',
    category: 'security',
    explanation: 'Made the rule more specific: added the "why" (shell injection), and the actionable detail (pass arguments as array). Clearer imperative tone.',
  },
}

interface RuleDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialValues?: { ruleText: string; category: RuleCategory; source: string }
  mode: 'add' | 'edit'
  onSubmit: (values: { ruleText: string; category: RuleCategory }) => void
  isPending?: boolean
}

function RuleDialog({ open, onOpenChange, initialValues, mode, onSubmit, isPending }: RuleDialogProps) {
  const [ruleText, setRuleText] = useState(initialValues?.ruleText ?? '')
  const [category, setCategory] = useState<RuleCategory>(initialValues?.category ?? 'general')
  const [aiState, setAiState] = useState<'idle' | 'improving' | 'done'>('idle')
  const [aiSuggestion, setAiSuggestion] = useState<{ improved: string; category: RuleCategory; explanation: string } | null>(null)

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) {
      setRuleText(initialValues?.ruleText ?? '')
      setCategory(initialValues?.category ?? 'general')
      setAiState('idle')
      setAiSuggestion(null)
    }
    onOpenChange(isOpen)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!ruleText.trim()) {
      toast.error('Rule text is required')
      return
    }
    onSubmit({ ruleText, category })
  }

  const handleImproveWithAI = useCallback(() => {
    if (!ruleText.trim()) {
      toast.error('Write a rule first, then improve it with AI')
      return
    }
    setAiState('improving')
    // Simulate AI processing — will be replaced with CM API call
    setTimeout(() => {
      setAiSuggestion(aiImprovements.default)
      setAiState('done')
    }, 1500)
  }, [ruleText])

  const handleAcceptSuggestion = useCallback(() => {
    if (!aiSuggestion) return
    setRuleText(aiSuggestion.improved)
    setCategory(aiSuggestion.category)
    setAiState('idle')
    setAiSuggestion(null)
    toast.success('AI suggestion applied')
  }, [aiSuggestion])

  const handleDismissSuggestion = useCallback(() => {
    setAiState('idle')
    setAiSuggestion(null)
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === 'add' ? 'Add Rule' : 'Edit Rule'}</DialogTitle>
          <DialogDescription>
            {mode === 'add'
              ? 'Define a new knowledge rule for agents to follow.'
              : 'Update this knowledge rule.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="rule-text" className="text-xs font-medium text-ink-secondary">
                Rule text
              </label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 h-6 text-[11px] text-accent hover:text-accent-hover"
                onClick={handleImproveWithAI}
                disabled={aiState === 'improving'}
              >
                {aiState === 'improving' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                {aiState === 'improving' ? 'Improving...' : 'Improve with AI'}
              </Button>
            </div>
            <Textarea
              id="rule-text"
              placeholder="e.g., Always validate user input with zod before processing API requests"
              value={ruleText}
              onChange={(e) => { setRuleText(e.target.value); if (aiState === 'done') { setAiState('idle'); setAiSuggestion(null) } }}
              rows={3}
            />
            <p className="mt-1 text-[10px] text-ink-disabled">
              Write as a clear imperative. Be specific about what to do and why.
            </p>
          </div>

          {/* AI suggestion */}
          {aiState === 'done' && aiSuggestion && (
            <div className="rounded-[var(--radius-lg)] border border-accent/20 bg-accent-subtle p-3 space-y-2 animate-[composer-in_150ms_ease-out]">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-medium text-accent">AI suggestion</span>
              </div>
              <p className="text-sm text-ink leading-relaxed">{aiSuggestion.improved}</p>
              <p className="text-[11px] text-ink-muted">{aiSuggestion.explanation}</p>
              {aiSuggestion.category !== category && (
                <p className="text-[11px] text-ink-muted">
                  Suggested category: <span className="text-accent">{aiSuggestion.category}</span>
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Button type="button" size="sm" className="h-7 text-xs gap-1" onClick={handleAcceptSuggestion}>
                  Accept
                </Button>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-ink-muted" onClick={handleDismissSuggestion}>
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="rule-category" className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Category
            </label>
            <Select value={category} onValueChange={(v) => setCategory(v as RuleCategory)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-secondary">Source</label>
            <Input value={initialValues?.source ?? 'Manual'} disabled className="opacity-60" />
            <p className="mt-1 text-[11px] text-ink-muted">
              Auto rules are created by agents. Manual rules are human-authored.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              {mode === 'add' ? 'Add Rule' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RuleCard({ rule, onEdit }: { rule: KnowledgeRule; onEdit: () => void }) {
  const updateRule = useUpdateRule()

  const handleApprove = () => {
    updateRule.mutate(
      { ruleId: rule.id, data: { maturity: 'established' as RuleMaturity } },
      { onSuccess: () => toast.success(`Rule "${rule.id}" approved and promoted to established`) },
    )
  }

  const handleDeprecate = () => {
    updateRule.mutate(
      { ruleId: rule.id, data: { maturity: 'deprecated' as RuleMaturity } },
      { onSuccess: () => toast.success(`Rule "${rule.id}" deprecated`) },
    )
  }

  const handleTestRule = () => {
    toast.info('Running rule against codebase...')
  }

  const sourceColors: Record<string, string> = {
    manual: 'text-cyan-400 bg-cyan-400/10',
    auto: 'text-orange-400 bg-orange-400/10',
  }

  return (
    <Card className="p-4">
      <p className="text-sm text-ink">{rule.ruleText}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className={categoryColors[rule.category]}>{rule.category}</Badge>
        <Badge className={maturityColors[rule.maturity]}>{rule.maturity}</Badge>
        <Badge className={sourceColors[rule.source]}>{rule.source}</Badge>
      </div>

      {/* Confidence bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-ink-muted">
          <span>Confidence</span>
          <span>{Math.round(rule.confidence * 100)}%</span>
        </div>
        <div className="mt-1 h-1.5 rounded-full bg-surface-elevated">
          <div
            className={cn('h-full rounded-full transition-all', getConfidenceColor(rule.confidence))}
            style={{ width: `${rule.confidence * 100}%` }}
          />
        </div>
      </div>

      {/* Stats + actions */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3.5 w-3.5 text-green-400" />
            {rule.helpfulCount}
          </span>
          <span className="flex items-center gap-1">
            <ThumbsDown className="h-3.5 w-3.5 text-red-400" />
            {rule.harmfulCount}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={handleTestRule}>
            <FlaskConical className="h-3 w-3" />
            Test
          </Button>
          {rule.maturity === 'candidate' && (
            <Button variant="outline" size="sm" onClick={handleApprove} disabled={updateRule.isPending}>
              Approve
            </Button>
          )}
          {rule.maturity !== 'deprecated' && (
            <Button variant="ghost" size="sm" className="text-error hover:text-error" onClick={handleDeprecate} disabled={updateRule.isPending}>
              Deprecate
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

export function RulesTab() {
  const { data: rules, isLoading } = useRules()
  const createRule = useCreateRule()
  const updateRule = useUpdateRule()
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [maturityFilter, setMaturityFilter] = useState<string>('all')
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<KnowledgeRule | null>(null)

  const allRules = rules ?? []

  const filteredRules = useMemo(() => {
    return allRules.filter((rule) => {
      if (categoryFilter !== 'all' && rule.category !== categoryFilter) return false
      if (maturityFilter !== 'all' && rule.maturity !== maturityFilter) return false
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        if (!rule.ruleText.toLowerCase().includes(q) && !rule.id.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [allRules, searchQuery, categoryFilter, maturityFilter])

  const candidateCount = allRules.filter((r) => r.maturity === 'candidate').length

  const handleAddRule = (values: { ruleText: string; category: RuleCategory }) => {
    createRule.mutate(
      { ruleText: values.ruleText, category: values.category },
      {
        onSuccess: () => {
          toast.success('Rule added')
          setAddDialogOpen(false)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleEditRule = (values: { ruleText: string; category: RuleCategory }) => {
    if (!editingRule) return
    updateRule.mutate(
      { ruleId: editingRule.id, data: { ruleText: values.ruleText, category: values.category } },
      {
        onSuccess: () => {
          toast.success('Rule updated')
          setEditingRule(null)
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  const handleApproveAllCandidates = () => {
    const candidates = allRules.filter((r) => r.maturity === 'candidate')
    for (const rule of candidates) {
      updateRule.mutate({ ruleId: rule.id, data: { maturity: 'established' as RuleMaturity } })
    }
    toast.success(`Approved ${candidates.length} candidate rules`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">{allRules.length} knowledge rules</p>
        <Button className="gap-2" size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Rule
        </Button>
      </div>

      {/* Guidelines */}
      <div className="rounded-[var(--radius-lg)] border border-edge bg-surface-elevated/50 px-4 py-3 text-xs text-ink-muted leading-relaxed space-y-1.5">
        <p>
          Rules are team conventions that agents follow during sessions. They come from two sources:
          <span className="text-cyan-400"> Manual</span> — added by TechLead, and
          <span className="text-orange-400"> Auto</span> — learned from code review feedback.
        </p>
        <p>
          <span className="font-medium text-ink-secondary">Maturity lifecycle:</span>{' '}
          <span className="text-yellow-400">Candidate</span> → needs TechLead approval →{' '}
          <span className="text-blue-400">Established</span> → validated over time →{' '}
          <span className="text-green-400">Proven</span>.
          Confidence decays over 90 days if not reinforced. Mark rules harmful via 👎 to deprecate.
        </p>
        <p className="text-ink-disabled">
          Write rules as clear imperatives: "Always use execFile instead of exec" rather than vague guidance.
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <Input
            placeholder="Search rules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {allCategories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={maturityFilter} onValueChange={setMaturityFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Maturity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All maturity</SelectItem>
            {allMaturities.map((m) => (
              <SelectItem key={m} value={m}>
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtered count + bulk actions */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          Showing {filteredRules.length} of {allRules.length} rules
        </p>
        {candidateCount > 0 && (
          <Button variant="outline" size="sm" className="text-xs" onClick={handleApproveAllCandidates}>
            Approve all candidates ({candidateCount})
          </Button>
        )}
      </div>

      {/* Rule cards */}
      <div className="space-y-3">
        {filteredRules.map((rule) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            onEdit={() => setEditingRule(rule)}
          />
        ))}
        {filteredRules.length === 0 && (
          <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-8 text-center">
            <p className="text-sm text-ink-muted">No rules match the current filters.</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className="text-xs text-ink-muted">
        Rules are automatically synced with CM via Docker service on port 9900
      </p>

      {/* Add dialog */}
      <RuleDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        mode="add"
        initialValues={{ ruleText: '', category: 'general', source: 'Manual' }}
        onSubmit={handleAddRule}
        isPending={createRule.isPending}
      />

      {/* Edit dialog */}
      {editingRule && (
        <RuleDialog
          key={editingRule.id}
          open={!!editingRule}
          onOpenChange={(open) => { if (!open) setEditingRule(null) }}
          mode="edit"
          initialValues={{
            ruleText: editingRule.ruleText,
            category: editingRule.category,
            source: editingRule.source === 'manual' ? 'Manual' : 'Auto',
          }}
          onSubmit={handleEditRule}
          isPending={updateRule.isPending}
        />
      )}
    </div>
  )
}
