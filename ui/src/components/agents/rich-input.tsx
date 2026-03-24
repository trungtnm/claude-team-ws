import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Paperclip, Image, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Attachment, SessionCapabilities } from '@/data/sessions'

// ── Types ──────────────────────────────────────────────────────────────────

interface RichInputProps {
  value: string
  onChange: (value: string) => void
  attachments: Attachment[]
  onAttachmentsChange: (attachments: Attachment[]) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  /** Capabilities for autocomplete — pass null to disable autocomplete */
  capabilities?: SessionCapabilities | null
  /** Minimum rows for the textarea */
  minRows?: number
  /** Maximum height in px */
  maxHeight?: number
  /** Show submit hint text below */
  showHint?: boolean
  /** Extra buttons to render left of textarea */
  leftActions?: React.ReactNode
}

interface AutocompleteItem {
  label: string
  type: 'command' | 'agent' | 'skill'
  description?: string
  insert: string
}

// ── File helper ────────────────────────────────────────────────────────────

function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] ?? ''
      resolve({
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64,
      })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Component ──────────────────────────────────────────────────────────────

export function RichInput({
  value,
  onChange,
  attachments,
  onAttachmentsChange,
  onSubmit,
  placeholder = 'Type a message...',
  disabled = false,
  autoFocus = false,
  capabilities = null,
  minRows = 1,
  maxHeight = 120,
  showHint = false,
  leftActions,
}: RichInputProps) {
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [autocompleteFilter, setAutocompleteFilter] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)

  // ── Autocomplete items ─────────────────────────────────────────────────

  const allItems = useMemo<AutocompleteItem[]>(() => {
    if (!capabilities) return []
    const items: AutocompleteItem[] = []
    const skillNames = new Set(capabilities.skills.map((s) => s.name))
    const added = new Set<string>()

    // Commands — label as "skill" if also in skills list
    for (const cmd of capabilities.commands) {
      const isSkill = skillNames.has(cmd.name)
      // Prefer skill description if it exists
      const skillDesc = isSkill
        ? capabilities.skills.find((s) => s.name === cmd.name)?.description
        : undefined
      items.push({
        label: `/${cmd.name}`,
        type: isSkill ? 'skill' : 'command',
        description: skillDesc ?? cmd.description,
        insert: `/${cmd.name} `,
      })
      added.add(cmd.name)
    }
    // Skills not already covered by commands
    for (const skill of capabilities.skills) {
      if (added.has(skill.name)) continue
      items.push({
        label: `/${skill.name}`,
        type: 'skill',
        description: skill.description,
        insert: `/${skill.name} `,
      })
    }
    // Agents
    for (const agent of capabilities.agents) {
      items.push({
        label: `@${agent.name}`,
        type: 'agent',
        description: agent.description,
        insert: `@${agent.name} `,
      })
    }
    return items
  }, [capabilities])

  const filteredItems = useMemo(() => {
    if (!autocompleteFilter) return allItems.slice(0, 15)
    const q = autocompleteFilter.toLowerCase()
    return allItems.filter((i) => i.label.toLowerCase().includes(q)).slice(0, 15)
  }, [allItems, autocompleteFilter])

  // ── Input change with autocomplete trigger ─────────────────────────────

  const handleInputChange = useCallback((val: string) => {
    onChange(val)
    const lastWord = val.split(/\s/).pop() ?? ''
    if ((lastWord.startsWith('/') || lastWord.startsWith('@')) && allItems.length > 0) {
      setShowAutocomplete(true)
      setAutocompleteFilter(lastWord)
      setSelectedIndex(0)
    } else {
      setShowAutocomplete(false)
    }
  }, [onChange, allItems.length])

  const insertAutocomplete = useCallback((item: AutocompleteItem) => {
    const words = value.split(/\s/)
    words[words.length - 1] = item.insert
    onChange(words.join(' '))
    setShowAutocomplete(false)
    textareaRef.current?.focus()
  }, [value, onChange])

  // ── Keyboard ───────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showAutocomplete && filteredItems.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1)); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertAutocomplete(filteredItems[selectedIndex]); return }
      if (e.key === 'Escape') { e.preventDefault(); setShowAutocomplete(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSubmit()
    }
  }, [showAutocomplete, filteredItems, selectedIndex, insertAutocomplete, onSubmit])

  // ── Files ──────────────────────────────────────────────────────────────

  const addFiles = useCallback(async (files: FileList | File[]) => {
    const newAtts: Attachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} too large (max 10MB)`); continue }
      newAtts.push(await fileToAttachment(file))
    }
    onAttachmentsChange([...attachments, ...newAtts])
  }, [attachments, onAttachmentsChange])

  const removeAttachment = useCallback((index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index))
  }, [attachments, onAttachmentsChange])

  // ── Paste / DnD ────────────────────────────────────────────────────────

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (const item of Array.from(items)) {
      if (item.kind === 'file') { const f = item.getAsFile(); if (f) files.push(f) }
    }
    if (files.length > 0) { e.preventDefault(); await addFiles(files) }
  }, [addFiles])

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }, [])
  const handleDragLeave = useCallback(() => setIsDragOver(false), [])
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) await addFiles(e.dataTransfer.files)
  }, [addFiles])

  // ── Auto-scroll autocomplete selection into view ────────────────────────

  useEffect(() => {
    if (!showAutocomplete || !autocompleteRef.current) return
    const container = autocompleteRef.current
    const selected = container.children[selectedIndex] as HTMLElement | undefined
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, showAutocomplete])

  // ── Auto-resize ────────────────────────────────────────────────────────

  useEffect(() => {
    const el = textareaRef.current
    if (el) { el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px` }
  }, [value, maxHeight])

  // ── Color map ──────────────────────────────────────────────────────────

  const typeColors: Record<string, string> = {
    command: 'text-accent',
    agent: 'text-info',
    skill: 'text-success',
  }

  return (
    <div className="relative" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {/* Autocomplete menu — positioned above the input box */}
      {showAutocomplete && filteredItems.length > 0 && (
        <div ref={autocompleteRef} className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-auto rounded-[var(--radius-md)] border border-edge bg-surface-overlay shadow-[var(--shadow-elevated)] z-50">
          {filteredItems.map((item, i) => (
            <button
              key={item.label}
              type="button"
              onClick={() => insertAutocomplete(item)}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer',
                i === selectedIndex ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/50',
              )}
            >
              <span className={cn('shrink-0 font-mono text-xs', typeColors[item.type])}>{item.label}</span>
              <span className="shrink-0 rounded bg-surface-elevated px-1 py-0.5 text-[9px] text-ink-disabled">{item.type}</span>
              {item.description && (
                <span className="truncate text-[11px] text-ink-muted">{item.description}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Unified input container */}
      <div className={cn(
        'rounded-[var(--radius-md)] border bg-surface-base transition-colors',
        isDragOver ? 'border-accent/40 bg-accent-subtle' : 'border-edge',
        'focus-within:ring-2 focus-within:ring-[var(--border-focus)] focus-within:border-transparent',
      )}>
        {/* Attachment previews — inside the input box */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2">
            {attachments.map((att, i) => (
              <div key={i} className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-surface-elevated px-1.5 py-1">
                {att.type === 'image' ? (
                  <img src={`data:${att.mimeType};base64,${att.data}`} alt={att.name} className="h-6 w-6 rounded object-cover" />
                ) : (
                  <Paperclip className="h-3 w-3 text-ink-muted" />
                )}
                <span className="text-[11px] text-ink-secondary max-w-24 truncate">{att.name}</span>
                <button type="button" onClick={() => removeAttachment(i)} className="text-ink-disabled hover:text-error cursor-pointer">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isDragOver ? 'Drop files here...' : placeholder}
          disabled={disabled}
          rows={minRows}
          autoFocus={autoFocus}
          className="w-full resize-none bg-transparent px-3 py-2 text-sm text-ink placeholder:text-ink-disabled focus:outline-none disabled:opacity-50"
        />

        {/* Bottom toolbar — inside the input box */}
        <div className="flex items-center justify-between px-2 pb-1.5">
          <div className="flex items-center gap-0.5">
            {leftActions}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              className="rounded p-1 text-ink-disabled hover:text-ink-muted hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.txt,.log,.json,.csv,.md,.ts,.tsx,.js,.jsx,.py,.yaml,.yml,.toml,.xml,.html,.css"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                const input = document.createElement('input')
                input.type = 'file'; input.accept = 'image/*'; input.multiple = true
                input.onchange = () => { if (input.files) addFiles(input.files) }
                input.click()
              }}
              title="Attach image"
              className="rounded p-1 text-ink-disabled hover:text-ink-muted hover:bg-surface-elevated transition-colors cursor-pointer"
            >
              <Image className="h-3.5 w-3.5" />
            </button>
            {showHint && (
              <span className="ml-2 text-[10px] text-ink-disabled hidden sm:inline">
                / commands · @ agents · drop files
              </span>
            )}
          </div>
          <span className="text-[10px] text-ink-disabled">
            Enter send · Shift+Enter newline
          </span>
        </div>
      </div>
    </div>
  )
}
