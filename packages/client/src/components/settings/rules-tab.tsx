import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2 } from 'lucide-react'
import { useRulesQuery, useCreateRuleMutation, useDeleteRuleMutation } from '@/hooks/use-rules'

export function RulesTab() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data, isLoading } = useRulesQuery(projectId ?? '')
  const createRule = useCreateRuleMutation(projectId ?? '')
  const deleteRule = useDeleteRuleMutation(projectId ?? '')
  const [newRule, setNewRule] = useState('')
  const [category, setCategory] = useState('general')

  const handleCreate = () => {
    if (!newRule.trim()) return
    createRule.mutate({ rule_text: newRule, category }, {
      onSuccess: () => setNewRule(''),
    })
  }

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-4">
        <Textarea
          placeholder="Add a new team rule..."
          value={newRule}
          onChange={(e) => setNewRule(e.target.value)}
          className="text-sm min-h-[60px]"
        />
        <div className="flex flex-col gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-xs bg-surface-raised border border-edge rounded px-2 py-1 text-ink"
          >
            <option value="general">General</option>
            <option value="coding">Coding</option>
            <option value="security">Security</option>
            <option value="testing">Testing</option>
            <option value="architecture">Architecture</option>
          </select>
          <Button size="sm" onClick={handleCreate} disabled={createRule.isPending}>
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </div>

      <ScrollArea className="max-h-[500px]">
        {isLoading ? (
          <p className="text-sm text-ink-muted">Loading rules...</p>
        ) : (
          <div className="space-y-2">
            {data?.rules.map((rule) => (
              <div key={rule.id} className="flex items-start gap-2 p-3 rounded bg-surface-raised">
                <div className="flex-1">
                  <p className="text-sm text-ink">{rule.rule_text}</p>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="outline" className="text-[10px]">{rule.category}</Badge>
                    <Badge variant="outline" className="text-[10px]">{rule.maturity}</Badge>
                    <span className="text-[10px] text-ink-muted">
                      Confidence: {(rule.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-error"
                  onClick={() => deleteRule.mutate(rule.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {data?.rules.length === 0 && (
              <p className="text-sm text-ink-muted text-center py-8">No rules yet. Add one above.</p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
