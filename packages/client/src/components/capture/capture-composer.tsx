import { useState, useRef, useCallback } from 'react'
import {
  Upload, Paperclip, Image, X, FileText, File as FileIcon,
  Lightbulb, Bug, Wrench, HelpCircle, ChevronDown,
} from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useCaptureStore } from '@/stores/capture-store'
import { useCreateCaptureMutation } from '@/hooks/use-captures'
import { toast } from 'sonner'

type PriorityHint = 0 | 1 | 2 | 3
type TypeHint = 'Feature' | 'Bug' | 'Task' | 'Question'

const priorities: { value: PriorityHint; label: string; description: string; color: string }[] = [
  { value: 0, label: 'P0 — Critical', description: 'Blocking work, needs immediate attention', color: 'border-error/40 bg-error/10 text-error' },
  { value: 1, label: 'P1 — High', description: 'Important, address this sprint', color: 'border-info/40 bg-info/10 text-info' },
  { value: 2, label: 'P2 — Medium', description: 'Plan when capacity allows', color: 'border-warning/40 bg-warning/10 text-warning' },
  { value: 3, label: 'P3 — Low', description: 'Backlog, revisit later', color: 'border-edge bg-surface-elevated text-ink-muted' },
]

const typeOptions: { value: TypeHint; label: string; icon: typeof Lightbulb; description: string }[] = [
  { value: 'Feature', label: 'Feature', icon: Lightbulb, description: 'New functionality or enhancement' },
  { value: 'Bug', label: 'Bug', icon: Bug, description: 'Something broken that needs fixing' },
  { value: 'Task', label: 'Task', icon: Wrench, description: 'Technical work, refactor, or chore' },
  { value: 'Question', label: 'Question', icon: HelpCircle, description: 'Needs discussion or clarification' },
]

interface Attachment {
  id: string
  name: string
  size: number
  type: string
  preview?: string
  file: File
}

/** Convert a File to a base64 data URI */
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/** Convert local Attachment[] to API-compatible format */
async function convertAttachments(atts: Attachment[]): Promise<Array<{ filename: string; mimeType: string; url: string }>> {
  return Promise.all(
    atts.map(async (att) => ({
      filename: att.name,
      mimeType: att.type,
      url: await fileToDataUri(att.file),
    })),
  )
}

export function CaptureComposer() {
  const { composerOpen, closeComposer } = useCaptureStore()
  const createMutation = useCreateCaptureMutation()
  const [text, setText] = useState('')
  const [priority, setPriority] = useState<PriorityHint | null>(null)
  const [captureType, setCaptureType] = useState<TypeHint | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [showClassification, setShowClassification] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resetForm = useCallback(() => {
    // Revoke object URLs to prevent memory leaks
    for (const att of attachments) {
      if (att.preview) URL.revokeObjectURL(att.preview)
    }
    setText('')
    setPriority(null)
    setCaptureType(null)
    setAttachments([])
    setShowClassification(false)
  }, [attachments])

  const handleSubmit = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    const apiAttachments = attachments.length > 0
      ? await convertAttachments(attachments)
      : undefined

    createMutation.mutate(
      { text: trimmed, attachments: apiAttachments },
      {
        onSuccess: () => {
          const hadAttachments = attachments.length > 0
          resetForm()
          closeComposer()
          toast.success(
            hadAttachments
              ? `Captured with ${attachments.length} attachment${attachments.length > 1 ? 's' : ''}`
              : 'Idea captured',
            { duration: 2000 },
          )
        },
        onError: (err) => {
          toast.error(err.message)
        },
      },
    )
  }, [text, attachments, createMutation, closeComposer, resetForm])

  const handleSubmitAnother = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return

    const apiAttachments = attachments.length > 0
      ? await convertAttachments(attachments)
      : undefined

    createMutation.mutate(
      { text: trimmed, attachments: apiAttachments },
      {
        onSuccess: () => {
          resetForm()
          toast('Captured — ready for another', { duration: 1500 })
          setTimeout(() => textareaRef.current?.focus(), 100)
        },
        onError: (err) => {
          toast.error(err.message)
        },
      },
    )
  }, [text, attachments, createMutation, resetForm])

  const addFiles = useCallback((files: FileList | File[]) => {
    const newAttachments: Attachment[] = Array.from(files).map((file) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      file,
    }))
    setAttachments((prev) => [...prev, ...newAttachments])
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id)
      if (att?.preview) URL.revokeObjectURL(att.preview)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files)
    }
  }, [addFiles])

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    const files: File[] = []
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length > 0) {
      addFiles(files)
    }
  }, [addFiles])

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const classificationLabel = [
    priority !== null && priorities[priority].label.split(' — ')[0],
    captureType,
  ].filter(Boolean).join(' · ')

  return (
    <Dialog open={composerOpen} onOpenChange={(open) => { if (!open) { closeComposer() } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">Capture an Idea</DialogTitle>
          <DialogDescription>
            Quickly log a thought, bug, or feature request. Your team will triage it into an Epic.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Main idea input */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
          >
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
              Describe your idea, issue, or observation
              <span className="text-error">*</span>
            </label>
            <p className="mb-2 text-[11px] text-ink-muted">
              Be specific — what did you notice, what should change, and why does it matter? You can paste screenshots directly.
            </p>
            <div
              className={cn(
                'rounded-[var(--radius-lg)] border transition-colors',
                isDragOver
                  ? 'border-accent bg-accent-muted'
                  : 'border-edge',
              )}
            >
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onPaste={handlePaste}
                placeholder="e.g., The agent session page doesn't show which files were modified — it's hard to tell what changed before reviewing the PR. Adding a file list summary would save time during triage."
                rows={5}
                className={cn(
                  'w-full resize-none rounded-t-[var(--radius-lg)] bg-surface-base px-3 py-2.5 text-sm text-ink',
                  'placeholder:text-ink-disabled',
                  'focus:outline-none',
                  isDragOver && 'bg-transparent',
                )}
              />
              {isDragOver && (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-accent">
                  <Upload className="h-4 w-4" />
                  Drop files here
                </div>
              )}
              {/* Inline toolbar */}
              <div className="flex items-center gap-1 border-t border-edge px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-elevated hover:text-ink-secondary cursor-pointer"
                >
                  <Paperclip className="h-3 w-3" />
                  Attach file
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] text-ink-muted transition-colors hover:bg-surface-elevated hover:text-ink-secondary cursor-pointer"
                >
                  <Image className="h-3 w-3" />
                  Add image
                </button>
                <span className="flex-1" />
                <span className="text-[10px] text-ink-disabled">{text.length}</span>
              </div>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.log,.json,.csv"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
            className="hidden"
          />

          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink-secondary">
                {attachments.length} file{attachments.length > 1 ? 's' : ''} attached
              </span>
              {attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-edge bg-surface-elevated p-2"
                >
                  {att.preview ? (
                    <img src={att.preview} alt={att.name} className="h-10 w-10 rounded-[var(--radius-sm)] object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] bg-surface-overlay">
                      {att.type.includes('pdf') ? <FileText className="h-4 w-4 text-error" /> : <FileIcon className="h-4 w-4 text-ink-muted" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-ink">{att.name}</p>
                    <p className="text-[11px] text-ink-muted">{formatFileSize(att.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(att.id)}
                    aria-label={`Remove attachment ${att.name}`}
                    className="rounded-[var(--radius-sm)] p-1 text-ink-muted hover:bg-surface-overlay hover:text-ink transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible classification section */}
          <div className="rounded-[var(--radius-lg)] border border-edge">
            <button
              type="button"
              onClick={() => setShowClassification(!showClassification)}
              className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-elevated/50 cursor-pointer rounded-[var(--radius-lg)]"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-ink-secondary">Priority & Type</span>
                <Badge variant="outline" className="text-[9px] px-1 py-0">Optional</Badge>
                {classificationLabel && (
                  <span className="text-[11px] text-accent">{classificationLabel}</span>
                )}
              </div>
              <ChevronDown className={cn(
                'h-3.5 w-3.5 text-ink-muted transition-transform',
                showClassification && 'rotate-180',
              )} />
            </button>

            {showClassification && (
              <div className="border-t border-edge px-4 py-4">
                <p className="mb-4 text-[11px] text-ink-muted">
                  Help the triager gauge urgency and category. These are hints — they can be changed during triage.
                </p>
                <div className="grid grid-cols-2 gap-5">
                  {/* Priority */}
                  <div>
                    <label className="mb-2 block text-xs font-medium text-ink-secondary">Priority</label>
                    <div className="flex flex-col gap-1.5">
                      {priorities.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setPriority(priority === p.value ? null : p.value)}
                          className={cn(
                            'flex flex-col items-start rounded-[var(--radius-md)] border px-3 py-2 text-left transition-all cursor-pointer',
                            priority === p.value
                              ? p.color
                              : 'border-edge bg-transparent hover:bg-surface-elevated',
                          )}
                        >
                          <span className={cn('text-xs font-medium', priority === p.value ? '' : 'text-ink-secondary')}>
                            {p.label}
                          </span>
                          <span className={cn('text-[10px]', priority === p.value ? 'opacity-80' : 'text-ink-muted')}>
                            {p.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Type */}
                  <div>
                    <label className="mb-2 block text-xs font-medium text-ink-secondary">Type</label>
                    <div className="flex flex-col gap-1.5">
                      {typeOptions.map((t) => {
                        const Icon = t.icon
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() => setCaptureType(captureType === t.value ? null : t.value)}
                            className={cn(
                              'flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-all cursor-pointer',
                              captureType === t.value
                                ? 'border-accent/40 bg-accent-muted'
                                : 'border-edge bg-transparent hover:bg-surface-elevated',
                            )}
                          >
                            <Icon className={cn('h-4 w-4 shrink-0', captureType === t.value ? 'text-accent' : 'text-ink-muted')} />
                            <div>
                              <span className={cn('text-xs font-medium', captureType === t.value ? 'text-accent' : 'text-ink-secondary')}>
                                {t.label}
                              </span>
                              <p className={cn('text-[10px]', captureType === t.value ? 'text-accent/70' : 'text-ink-muted')}>
                                {t.description}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[10px] text-ink-disabled">
            Tip: paste screenshots with ⌘V directly in the text area
          </span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={closeComposer}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSubmitAnother}
              disabled={!text.trim()}
            >
              Capture & Add Another
            </Button>
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!text.trim()}
            >
              Capture
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
