import { useMemo, useState } from 'react'
import {
  Brain,
  Wrench,
  HelpCircle,
  Terminal,
  Play,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  FileCode,
  PanelLeftClose,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ParsedStreamEvent } from '@/hooks/use-sessions'

// ─── Tree Node Model ─────────────────────────────────────────────────────────

interface TreeNode {
  id: number
  label: string
  type: 'thinking' | 'tool' | 'question' | 'system' | 'result' | 'error' | 'user' | 'step' | 'workflow'
  highlighted: boolean
  children: TreeNode[]
  eventIds: number[]  // all event IDs in this group
}

// ─── Event Classification ───────────────────────────────────────────────────

function classifyEvent(event: ParsedStreamEvent): TreeNode['type'] {
  if (event.type === 'assistant') return 'thinking'
  if (event.type === 'tool_use') {
    if (event.toolName === 'AskUserQuestion') return 'question'
    return 'tool'
  }
  if (event.type === 'tool_result') return 'tool'
  if (event.type === 'user_message') return 'user'
  if (event.type === 'result') return 'result'
  if (event.type === 'error') return 'error'
  if (event.type === 'system') {
    if (event.subtype === 'step_start' || event.subtype === 'step_complete') return 'step'
    if (event.subtype === 'workflow_start' || event.subtype === 'workflow_complete') return 'workflow'
    return 'system'
  }
  return 'system'
}

function isHighlighted(type: TreeNode['type']): boolean {
  return type === 'thinking' || type === 'question' || type === 'user' || type === 'step' || type === 'workflow' || type === 'error' || type === 'result'
}

function getLabel(event: ParsedStreamEvent, type: TreeNode['type']): string {
  switch (type) {
    case 'thinking':
      return event.content.slice(0, 40) || 'Thinking...'
    case 'question':
      return 'Question: ' + (event.questionData?.text?.slice(0, 30) || 'User input needed')
    case 'user':
      return 'User: ' + event.content.slice(0, 30)
    case 'tool':
      return event.toolName || 'Tool call'
    case 'step':
      return `Step: ${event.stepId || 'unknown'}`
    case 'workflow':
      return event.subtype === 'workflow_start' ? 'Workflow started' : 'Workflow complete'
    case 'result':
      return 'Result'
    case 'error':
      return 'Error: ' + event.content.slice(0, 30)
    case 'system':
      return event.content.slice(0, 40) || 'System'
  }
}

function getIcon(type: TreeNode['type']) {
  switch (type) {
    case 'thinking': return Brain
    case 'tool': return Wrench
    case 'question': return HelpCircle
    case 'user': return FileCode
    case 'system': return Terminal
    case 'step': return Play
    case 'workflow': return Zap
    case 'result': return CheckCircle
    case 'error': return XCircle
  }
}

function getColor(type: TreeNode['type']): string {
  switch (type) {
    case 'thinking': return 'text-accent'
    case 'tool': return 'text-ink-muted'
    case 'question': return 'text-amber-400'
    case 'user': return 'text-blue-400'
    case 'system': return 'text-ink-disabled'
    case 'step': return 'text-blue-400'
    case 'workflow': return 'text-accent'
    case 'result': return 'text-green-400'
    case 'error': return 'text-red-400'
  }
}

// ─── Build Tree from Events ──────────────────────────────────────────────────

function buildTree(events: ParsedStreamEvent[]): TreeNode[] {
  const nodes: TreeNode[] = []
  let consecutiveTools: ParsedStreamEvent[] = []

  const flushTools = () => {
    if (consecutiveTools.length === 0) return
    if (consecutiveTools.length === 1) {
      const ev = consecutiveTools[0]
      const type = classifyEvent(ev)
      nodes.push({
        id: ev.id,
        label: getLabel(ev, type),
        type,
        highlighted: isHighlighted(type),
        children: [],
        eventIds: [ev.id],
      })
    } else {
      // Group consecutive tools
      const toolNames = [...new Set(consecutiveTools.filter(e => e.toolName).map(e => e.toolName!))]
      const label = toolNames.length <= 2
        ? toolNames.join(', ')
        : `${consecutiveTools.length} tool calls`
      nodes.push({
        id: consecutiveTools[0].id,
        label,
        type: 'tool',
        highlighted: false,
        children: consecutiveTools.map(ev => ({
          id: ev.id,
          label: ev.toolName || 'tool',
          type: 'tool' as const,
          highlighted: false,
          children: [],
          eventIds: [ev.id],
        })),
        eventIds: consecutiveTools.map(e => e.id),
      })
    }
    consecutiveTools = []
  }

  for (const event of events) {
    const type = classifyEvent(event)

    // Filter out noise: context window events, session idle messages
    if (type === 'system' && !event.subtype) {
      if (/^Context:\s*\d+%/i.test(event.content)) continue
      if (/session idle/i.test(event.content)) continue
      if (event.content === 'Session started') continue
    }

    // Group consecutive tool_use and tool_result events
    if (type === 'tool' && !isHighlighted(type)) {
      consecutiveTools.push(event)
      continue
    }

    // Flush any pending tool group before adding a non-tool node
    flushTools()

    nodes.push({
      id: event.id,
      label: getLabel(event, type),
      type,
      highlighted: isHighlighted(type),
      children: [],
      eventIds: [event.id],
    })
  }

  flushTools()
  return nodes
}

// ─── Tree Node Component ─────────────────────────────────────────────────────

function TreeNodeItem({
  node,
  activeEventId,
  onSelect,
  depth = 0,
}: {
  node: TreeNode
  activeEventId: number | null
  onSelect: (eventId: number) => void
  depth?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getIcon(node.type)
  const color = getColor(node.type)
  const isActive = activeEventId != null && node.eventIds.includes(activeEventId)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) setExpanded(!expanded)
          onSelect(node.eventIds[0])
        }}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 py-1 text-left text-[11px] transition-colors cursor-pointer',
          isActive
            ? 'bg-accent/10 text-accent'
            : node.highlighted
              ? 'text-ink-secondary hover:bg-surface-elevated'
              : 'text-ink-disabled hover:bg-surface-elevated/50',
        )}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="h-3 w-3 shrink-0 text-ink-disabled" />
            : <ChevronRight className="h-3 w-3 shrink-0 text-ink-disabled" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className={cn('h-3 w-3 shrink-0', isActive ? 'text-accent' : color)} />
        <span className="truncate">{node.label}</span>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <TreeNodeItem
              key={child.id}
              node={child}
              activeEventId={activeEventId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main Sidebar Component ──────────────────────────────────────────────────

interface StepTreeSidebarProps {
  events: ParsedStreamEvent[]
  activeEventId: number | null
  onSelectEvent: (eventId: number) => void
  onClose: () => void
}

export function StepTreeSidebar({ events, activeEventId, onSelectEvent, onClose }: StepTreeSidebarProps) {
  const tree = useMemo(() => buildTree(events), [events])

  return (
    <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-edge bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <span className="text-xs font-semibold text-ink-secondary">Steps</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-ink-disabled">{tree.length}</span>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} aria-label="Close step tree">
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1">
        <div className="py-1 px-1">
          {tree.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <span className="text-[11px] text-ink-disabled">No steps yet</span>
            </div>
          ) : (
            tree.map(node => (
              <TreeNodeItem
                key={node.id}
                node={node}
                activeEventId={activeEventId}
                onSelect={onSelectEvent}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
