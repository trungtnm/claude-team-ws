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
  User,
  PanelLeftClose,
  Circle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import type { ParsedStreamEvent } from '@/hooks/use-sessions'

// ─── Tree Node Model ─────────────────────────────────────────────────────────

interface TreeNode {
  id: number
  label: string
  tooltip: string
  type: 'thinking' | 'tool' | 'question' | 'system' | 'result' | 'error' | 'user' | 'step' | 'workflow'
  highlighted: boolean
  childCount: number
  children: TreeNode[]
  eventIds: number[]
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
  return type === 'question' || type === 'thinking' || type === 'error' || type === 'step' || type === 'workflow'
}

// ─── Labels ─────────────────────────────────────────────────────────────────

function getLabel(_event: ParsedStreamEvent, type: TreeNode['type']): string {
  switch (type) {
    case 'thinking':   return 'Thinking'
    case 'question':   return 'User Input Required'
    case 'user':       return 'User'
    case 'tool':       return _event.toolName || 'Tool'
    case 'step':       return `Step: ${_event.stepId || 'unknown'}`
    case 'workflow':   return _event.subtype === 'workflow_start' ? 'Workflow started' : 'Workflow complete'
    case 'result':     return 'Completed'
    case 'error':      return 'Error'
    case 'system':     return _event.content.slice(0, 40) || 'System'
  }
}

// ─── Tooltips ───────────────────────────────────────────────────────────────

function getTooltip(event: ParsedStreamEvent, type: TreeNode['type']): string {
  switch (type) {
    case 'thinking':   return event.content || 'Agent is thinking...'
    case 'question':   return event.questionData?.text || event.content || 'Waiting for user input'
    case 'user':       return event.content || 'User message'
    case 'tool': {
      const name = event.toolName || 'Tool'
      const input = event.toolInput ? `\n${event.toolInput.slice(0, 300)}` : ''
      return `${name}${input}`
    }
    case 'step':       return `${event.stepId} (${event.stepStatus || 'running'})${event.durationMs ? ` — ${event.durationMs}ms` : ''}`
    case 'workflow':   return event.content || 'Workflow'
    case 'result':     return event.content || 'Session completed'
    case 'error':      return event.content || 'An error occurred'
    case 'system':     return event.content || 'System event'
  }
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function getIcon(type: TreeNode['type']) {
  switch (type) {
    case 'thinking':   return Brain
    case 'tool':       return Wrench
    case 'question':   return HelpCircle
    case 'user':       return User
    case 'system':     return Terminal
    case 'step':       return Play
    case 'workflow':   return Zap
    case 'result':     return CheckCircle
    case 'error':      return XCircle
  }
}

// ─── Colors ─────────────────────────────────────────────────────────────────

function getColor(type: TreeNode['type']): string {
  switch (type) {
    case 'thinking':   return 'text-accent'
    case 'tool':       return 'text-ink-muted'
    case 'question':   return 'text-amber-400'
    case 'user':       return 'text-ink-disabled'
    case 'system':     return 'text-ink-disabled'
    case 'step':       return 'text-blue-400'
    case 'workflow':   return 'text-accent'
    case 'result':     return 'text-green-400'
    case 'error':      return 'text-red-400'
  }
}

function getLeftBorderColor(type: TreeNode['type']): string {
  switch (type) {
    case 'thinking':   return 'border-l-accent/40'
    case 'question':   return 'border-l-amber-400/60'
    case 'error':      return 'border-l-red-400/60'
    case 'step':       return 'border-l-blue-400/40'
    case 'workflow':   return 'border-l-accent/40'
    default:           return 'border-l-transparent'
  }
}

// ─── Build Tree from Events ──────────────────────────────────────────────────

function makeNode(event: ParsedStreamEvent, type: TreeNode['type']): TreeNode {
  return {
    id: event.id,
    label: getLabel(event, type),
    tooltip: getTooltip(event, type),
    type,
    highlighted: isHighlighted(type),
    childCount: 0,
    children: [],
    eventIds: [event.id],
  }
}

function buildTree(events: ParsedStreamEvent[]): TreeNode[] {
  const nodes: TreeNode[] = []
  let consecutiveTools: ParsedStreamEvent[] = []

  const flushTools = () => {
    if (consecutiveTools.length === 0) return
    if (consecutiveTools.length === 1) {
      nodes.push(makeNode(consecutiveTools[0], 'tool'))
    } else {
      // Count unique tool names for the label
      const toolCounts = new Map<string, number>()
      for (const ev of consecutiveTools) {
        if (ev.toolName) toolCounts.set(ev.toolName, (toolCounts.get(ev.toolName) || 0) + 1)
      }
      const parts: string[] = []
      for (const [name, count] of toolCounts) {
        parts.push(count > 1 ? `${name} ×${count}` : name)
      }
      const label = parts.length <= 3
        ? parts.join(', ')
        : `${consecutiveTools.length} tool calls`

      const tooltip = consecutiveTools
        .filter(e => e.toolName)
        .map(e => `${e.toolName}${e.toolInput ? `: ${e.toolInput.slice(0, 60)}` : ''}`)
        .join('\n')

      nodes.push({
        id: consecutiveTools[0].id,
        label,
        tooltip,
        type: 'tool',
        highlighted: false,
        childCount: consecutiveTools.length,
        children: consecutiveTools.map(ev => makeNode(ev, 'tool')),
        eventIds: consecutiveTools.map(e => e.id),
      })
    }
    consecutiveTools = []
  }

  for (const event of events) {
    const type = classifyEvent(event)

    // Filter out noise
    if (type === 'system' && !event.subtype) {
      if (/^Context:\s*\d+%/i.test(event.content)) continue
      if (/session idle/i.test(event.content)) continue
      if (event.content === 'Session started') continue
    }

    // Group consecutive tool events
    if (type === 'tool') {
      consecutiveTools.push(event)
      continue
    }

    flushTools()
    nodes.push(makeNode(event, type))
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
  const isQuestion = node.type === 'question'
  const isImportant = isQuestion || node.type === 'error'
  const borderColor = getLeftBorderColor(node.type)

  return (
    <div>
      <Tooltip delayDuration={400}>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => {
              if (hasChildren) setExpanded(!expanded)
              onSelect(node.eventIds[0])
            }}
            className={cn(
              'flex w-full items-center gap-1.5 border-l-2 px-1.5 py-1 text-left text-[11px] transition-all duration-150 cursor-pointer',
              borderColor,
              isActive
                ? 'bg-accent/10 text-accent border-l-accent'
                : isQuestion
                  ? 'text-amber-400 bg-amber-500/5 hover:bg-amber-500/10'
                  : node.highlighted
                    ? 'text-ink-secondary hover:bg-surface-elevated'
                    : 'text-ink-disabled hover:bg-surface-elevated/50',
            )}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
          >
            {hasChildren ? (
              <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                {expanded
                  ? <ChevronDown className="h-3 w-3 text-ink-disabled transition-transform" />
                  : <ChevronRight className="h-3 w-3 text-ink-disabled transition-transform" />
                }
              </span>
            ) : (
              <span className="flex h-3 w-3 shrink-0 items-center justify-center">
                <Circle className="h-1 w-1 fill-current opacity-30" />
              </span>
            )}
            <Icon className={cn(
              'shrink-0 transition-colors',
              isQuestion ? 'h-3.5 w-3.5' : 'h-3 w-3',
              isActive ? 'text-accent' : color,
            )} />
            <span className={cn(
              'truncate',
              isImportant && 'font-semibold',
              node.type === 'thinking' && 'font-medium',
            )}>
              {node.label}
            </span>
            {hasChildren && node.childCount > 0 && (
              <span className="ml-auto shrink-0 rounded-full bg-surface-elevated px-1.5 text-[9px] font-medium text-ink-disabled">
                {node.childCount}
              </span>
            )}
          </button>
        </TooltipTrigger>
        {node.tooltip && (
          <TooltipContent
            side="right"
            align="start"
            className="max-w-[350px] max-h-[300px] overflow-y-auto whitespace-pre-wrap"
          >
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-ink-muted uppercase tracking-wide">
                {node.type === 'tool' ? (node.children.length > 0 ? `${node.childCount} tool calls` : node.label) : node.type}
              </p>
              <p className={cn(
                'text-[11px] leading-relaxed',
                node.type === 'tool' && 'font-mono text-[10px]',
              )}>
                {node.tooltip}
              </p>
            </div>
          </TooltipContent>
        )}
      </Tooltip>
      {expanded && hasChildren && (
        <div className="animate-in fade-in-0 slide-in-from-top-1 duration-150">
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

  const thinkingCount = useMemo(() => tree.filter(n => n.type === 'thinking').length, [tree])
  const toolCount = useMemo(() => tree.filter(n => n.type === 'tool').length, [tree])
  const questionCount = useMemo(() => tree.filter(n => n.type === 'question').length, [tree])

  return (
    <TooltipProvider>
      <div className="flex h-full w-[220px] shrink-0 flex-col border-r border-edge bg-surface-base">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-edge px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-secondary">Steps</span>
            <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[9px] font-medium text-ink-disabled">
              {tree.length}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose} aria-label="Close step tree">
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Tree */}
        <ScrollArea className="flex-1">
          <div className="py-1">
            {tree.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-12">
                <Brain className="h-6 w-6 text-ink-disabled/50" />
                <span className="text-[11px] text-ink-disabled">Waiting for steps...</span>
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

        {/* Footer summary */}
        {tree.length > 0 && (
          <div className="flex items-center gap-3 border-t border-edge px-3 py-1.5 text-[10px] text-ink-disabled">
            <span>{thinkingCount} thinking</span>
            <span>{toolCount} tools</span>
            {questionCount > 0 && <span>{questionCount} questions</span>}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
