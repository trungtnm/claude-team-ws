import { useState, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import { FileCode2, Wand2, Bot, Terminal, BookOpen, Plus, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuth } from '@/providers/auth-provider'
import {
  useClaudeMdQuery, useClaudeMdMutation,
  useSkillsQuery, useSkillQuery, useSkillMutation, useDeleteSkillMutation,
  useAgentsQuery, useAgentQuery, useAgentMutation, useDeleteAgentMutation,
  useCommandsQuery, useCommandQuery, useCommandMutation, useDeleteCommandMutation,
  useRulesConfigQuery, useRuleConfigQuery, useRuleConfigMutation, useDeleteRuleConfigMutation,
} from '@/hooks/use-claude-config'
import type { FileContent, SkillSummary, ConfigItemSummary } from '@/lib/resources'

function formatTimeAgo(mtime: number): string {
  const seconds = Math.floor(Date.now() / 1000) - mtime
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function TokenEstimate({ content }: { content: string }) {
  const tokens = Math.ceil(content.length / 4)
  return (
    <span className="text-xs text-muted-foreground tabular-nums">
      ~{tokens.toLocaleString()} tokens
    </span>
  )
}

// ── CLAUDE.md Editor ──────────────────────────────────────────────────────

function ClaudeMdEditor() {
  const { data, isLoading } = useClaudeMdQuery()
  const mutation = useClaudeMdMutation()
  const { user } = useAuth()
  const canEdit = user?.role === 'pm' || user?.role === 'techlead'

  const [localContent, setLocalContent] = useState<string | null>(null)
  const [lastMtime, setLastMtime] = useState<number | null>(null)

  const content = localContent ?? data?.content ?? ''
  const isDirty = localContent !== null && localContent !== (data?.content ?? '')

  const handleEditorMount = useCallback(() => {
    if (data?.content != null && localContent === null) {
      setLocalContent(data.content)
      setLastMtime(data.mtime)
    }
  }, [data, localContent])

  // Sync from server when data loads
  if (data && localContent === null && data.content != null) {
    setLocalContent(data.content)
    setLastMtime(data.mtime)
  }

  const handleSave = () => {
    if (!localContent) return
    mutation.mutate(
      { content: localContent, expectedMtime: lastMtime ?? undefined },
      {
        onSuccess: (result: FileContent) => {
          setLastMtime(result.mtime)
        },
      },
    )
  }

  if (isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading CLAUDE.md...</div>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium">CLAUDE.md</h3>
          {data?.mtime && <span className="text-xs text-muted-foreground">Last modified: {formatTimeAgo(data.mtime)}</span>}
          {content && <TokenEstimate content={content} />}
        </div>
        {canEdit && (
          <Button size="sm" onClick={handleSave} disabled={!isDirty || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        )}
      </div>
      <div className="rounded-md border overflow-hidden" style={{ height: '500px' }}>
        <Editor
          height="100%"
          language="markdown"
          theme="vs-dark"
          value={content}
          onChange={(val) => setLocalContent(val ?? '')}
          options={{
            readOnly: !canEdit,
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
          }}
          onMount={handleEditorMount}
        />
      </div>
    </div>
  )
}

// ── Skills List + Editor ──────────────────────────────────────────────────

function SkillsPanel() {
  const { data: skills = [], isLoading } = useSkillsQuery()
  const { user } = useAuth()
  const canEdit = user?.role === 'pm' || user?.role === 'techlead'
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  if (isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading skills...</div>
  }

  if (selectedSkill || creatingNew) {
    return (
      <SkillEditor
        name={selectedSkill ?? 'new-skill'}
        isNew={creatingNew}
        onClose={() => { setSelectedSkill(null); setCreatingNew(false) }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Skills ({skills.length})</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setCreatingNew(true)}>
            <Plus className="mr-1 h-3 w-3" /> Create Skill
          </Button>
        )}
      </div>
      {skills.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">No skills found in .claude/skills/</p>
      ) : (
        <div className="grid gap-2">
          {skills.map((skill: SkillSummary) => (
            <Card
              key={skill.name}
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setSelectedSkill(skill.name)}
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{skill.name}</span>
                </div>
                {skill.description && <p className="text-xs text-muted-foreground ml-6">{skill.description}</p>}
                {skill.triggers.length > 0 && (
                  <div className="flex gap-1 ml-6">
                    {skill.triggers.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-xs text-muted-foreground">{formatTimeAgo(skill.mtime)}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function SkillEditor({ name, isNew, onClose }: { name: string; isNew: boolean; onClose: () => void }) {
  const { data, isLoading } = useSkillQuery(isNew ? '' : name)
  const mutation = useSkillMutation()
  const deleteMutation = useDeleteSkillMutation()

  const defaultContent = `---
name: ${name}
description: ''
triggers: []
---

# ${name}

Skill instructions here.
`
  const [localContent, setLocalContent] = useState<string | null>(isNew ? defaultContent : null)
  const skillName = name

  if (!isNew && data && localContent === null) {
    setLocalContent(data.content)
  }

  const handleSave = () => {
    if (!localContent) return
    mutation.mutate(
      { name: skillName, content: localContent, expectedMtime: isNew ? undefined : data?.mtime ?? undefined },
      { onSuccess: onClose },
    )
  }

  const handleDelete = () => {
    if (confirm(`Delete skill "${name}"?`)) {
      deleteMutation.mutate(name, { onSuccess: onClose })
    }
  }

  if (!isNew && isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading skill...</div>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>← Back</Button>
          <h3 className="font-medium">{isNew ? 'New Skill' : name}</h3>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
      <div className="rounded-md border overflow-hidden" style={{ height: '500px' }}>
        <Editor
          height="100%"
          language="markdown"
          theme="vs-dark"
          value={localContent ?? ''}
          onChange={(val) => setLocalContent(val ?? '')}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  )
}

// ── Agent/Command/Rule Panels (proper hooks, no hooks-as-props) ─────────

function AgentsPanel() {
  const { data: agents = [], isLoading } = useAgentsQuery()
  const { user } = useAuth()
  const canEdit = user?.role === 'pm' || user?.role === 'techlead'
  const [selected, setSelected] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  if (isLoading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading agents...</div>

  if (selected || creatingNew) {
    const name = selected ?? 'new-agent'
    return <AgentEditor name={name} isNew={creatingNew} onClose={() => { setSelected(null); setCreatingNew(false) }} />
  }

  return (
    <ConfigItemList type="agents" items={agents} icon={Bot} canEdit={canEdit}
      onSelect={setSelected} onCreate={() => setCreatingNew(true)} />
  )
}

function AgentEditor({ name, isNew, onClose }: { name: string; isNew: boolean; onClose: () => void }) {
  const { data, isLoading } = useAgentQuery(isNew ? '' : name)
  const mutation = useAgentMutation()
  const deleteMutation = useDeleteAgentMutation()
  const template = `---\nname: ${name}\ndescription: ''\nmodel: sonnet\n---\n\nAgent instructions here.\n`
  return <ItemEditor type="agents" name={name} isNew={isNew} onClose={onClose}
    data={data} isLoading={isLoading} mutation={mutation} deleteMutation={deleteMutation} template={template} />
}

function CommandsPanel() {
  const { data: commands = [], isLoading } = useCommandsQuery()
  const { user } = useAuth()
  const canEdit = user?.role === 'pm' || user?.role === 'techlead'
  const [selected, setSelected] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  if (isLoading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading commands...</div>

  if (selected || creatingNew) {
    const name = selected ?? 'new-command'
    return <CommandEditor name={name} isNew={creatingNew} onClose={() => { setSelected(null); setCreatingNew(false) }} />
  }

  return (
    <ConfigItemList type="commands" items={commands} icon={Terminal} canEdit={canEdit}
      onSelect={setSelected} onCreate={() => setCreatingNew(true)} />
  )
}

function CommandEditor({ name, isNew, onClose }: { name: string; isNew: boolean; onClose: () => void }) {
  const { data, isLoading } = useCommandQuery(isNew ? '' : name)
  const mutation = useCommandMutation()
  const deleteMutation = useDeleteCommandMutation()
  const template = `---\nname: ${name}\ndescription: ''\n---\n\nCommand instructions here.\n`
  return <ItemEditor type="commands" name={name} isNew={isNew} onClose={onClose}
    data={data} isLoading={isLoading} mutation={mutation} deleteMutation={deleteMutation} template={template} />
}

function RulesPanel() {
  const { data: rules = [], isLoading } = useRulesConfigQuery()
  const { user } = useAuth()
  const canEdit = user?.role === 'pm' || user?.role === 'techlead'
  const [selected, setSelected] = useState<string | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)

  if (isLoading) return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading rules...</div>

  if (selected || creatingNew) {
    const name = selected ?? 'new-rule'
    return <RuleEditor name={name} isNew={creatingNew} onClose={() => { setSelected(null); setCreatingNew(false) }} />
  }

  return (
    <ConfigItemList type="rules" items={rules} icon={BookOpen} canEdit={canEdit}
      onSelect={setSelected} onCreate={() => setCreatingNew(true)} />
  )
}

function RuleEditor({ name, isNew, onClose }: { name: string; isNew: boolean; onClose: () => void }) {
  const { data, isLoading } = useRuleConfigQuery(isNew ? '' : name)
  const mutation = useRuleConfigMutation()
  const deleteMutation = useDeleteRuleConfigMutation()
  const template = `# ${name}\n\nRule content here.\n`
  return <ItemEditor type="rules" name={name} isNew={isNew} onClose={onClose}
    data={data} isLoading={isLoading} mutation={mutation} deleteMutation={deleteMutation} template={template} />
}

// ── Shared list + editor (no hooks, just data) ─────────────────────────

function ConfigItemList({ type, items, icon: Icon, canEdit, onSelect, onCreate }: {
  type: string
  items: ConfigItemSummary[]
  icon: typeof Bot
  canEdit: boolean
  onSelect: (name: string) => void
  onCreate: () => void
}) {
  const label = type.charAt(0).toUpperCase() + type.slice(1)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">{label} ({items.length})</h3>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={onCreate}>
            <Plus className="mr-1 h-3 w-3" /> Create
          </Button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground p-4">No {type} found in .claude/{type}/</p>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <Card
              key={item.name}
              className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => onSelect(item.name)}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{item.name}</span>
                {item.description && <span className="text-xs text-muted-foreground">— {item.description}</span>}
              </div>
              <span className="text-xs text-muted-foreground">{formatTimeAgo(item.mtime)}</span>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function ItemEditor({ type, name, isNew, onClose, data, isLoading, mutation, deleteMutation, template }: {
  type: string
  name: string
  isNew: boolean
  onClose: () => void
  data: FileContent | undefined
  isLoading: boolean
  mutation: { mutate: (data: { name: string; content: string; expectedMtime?: number }, opts?: { onSuccess?: () => void }) => void; isPending: boolean }
  deleteMutation: { mutate: (name: string, opts?: { onSuccess?: () => void }) => void; isPending: boolean }
  template: string
}) {
  const [localContent, setLocalContent] = useState<string | null>(isNew ? template : null)

  if (!isNew && data && localContent === null) {
    setLocalContent(data.content)
  }

  const handleSave = () => {
    if (!localContent) return
    mutation.mutate(
      { name, content: localContent, expectedMtime: isNew ? undefined : data?.mtime ?? undefined },
      { onSuccess: onClose },
    )
  }

  const handleDelete = () => {
    if (confirm(`Delete ${type.slice(0, -1)} "${name}"?`)) {
      deleteMutation.mutate(name, { onSuccess: onClose })
    }
  }

  if (!isNew && isLoading) {
    return <div className="flex items-center gap-2 p-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>← Back</Button>
          <h3 className="font-medium">{isNew ? `New ${type.slice(0, -1)}` : name}</h3>
        </div>
        <div className="flex gap-2">
          {!isNew && (
            <Button size="sm" variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
              <Trash2 className="mr-1 h-3 w-3" /> Delete
            </Button>
          )}
          <Button size="sm" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </div>
      <div className="rounded-md border overflow-hidden" style={{ height: '500px' }}>
        <Editor
          height="100%"
          language="markdown"
          theme="vs-dark"
          value={localContent ?? ''}
          onChange={(val) => setLocalContent(val ?? '')}
          options={{ minimap: { enabled: false }, fontSize: 13, lineNumbers: 'on', wordWrap: 'on', scrollBeyondLastLine: false }}
        />
      </div>
    </div>
  )
}

// ── Main Tab Component ──────────────────────────────────────────────────

export function ClaudeConfigTab() {
  return (
    <div className="space-y-4 pt-4">
      <Tabs defaultValue="claude-md">
        <TabsList>
          <TabsTrigger value="claude-md" className="gap-1.5">
            <FileCode2 className="h-3.5 w-3.5" /> CLAUDE.md
          </TabsTrigger>
          <TabsTrigger value="skills" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5">
            <Bot className="h-3.5 w-3.5" /> Agents
          </TabsTrigger>
          <TabsTrigger value="commands" className="gap-1.5">
            <Terminal className="h-3.5 w-3.5" /> Commands
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="claude-md">
          <ClaudeMdEditor />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsPanel />
        </TabsContent>
        <TabsContent value="agents">
          <AgentsPanel />
        </TabsContent>
        <TabsContent value="commands">
          <CommandsPanel />
        </TabsContent>
        <TabsContent value="rules">
          <RulesPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}
