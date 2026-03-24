import { FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PrFile } from '@/data/pr-review'

interface FileTreeProps {
  files: PrFile[]
  selectedFile: string
  onSelectFile: (path: string) => void
}

export function FileTree({ files, selectedFile, onSelectFile }: FileTreeProps) {
  return (
    <div className="flex flex-col">
      <h3 className="px-3 py-2 text-sm font-semibold text-ink-secondary">
        Files Changed ({files.length})
      </h3>
      <div className="flex flex-col">
        {files.map((file) => {
          const isSelected = file.path === selectedFile
          return (
            <button
              key={file.path}
              onClick={() => onSelectFile(file.path)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-surface-elevated',
                isSelected && 'bg-surface-elevated border-l-2 border-accent',
                !isSelected && 'border-l-2 border-transparent',
              )}
            >
              <FileCode className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
              <span className="min-w-0 truncate text-ink-secondary">{file.path}</span>
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <span className="text-xs font-medium text-success">+{file.additions}</span>
                <span className="text-xs font-medium text-error">-{file.deletions}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
