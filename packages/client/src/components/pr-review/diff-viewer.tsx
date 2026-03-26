import ReactDiffViewer from 'react-diff-viewer-continued'
import type { PrFile } from '@/types'

interface DiffViewerProps {
  file: PrFile
}

const diffStyles = {
  variables: {
    dark: {
      diffViewerBackground: '#141210',
      diffViewerColor: '#f5f0eb',
      addedBackground: 'rgba(34, 197, 94, 0.08)',
      addedColor: '#86efac',
      removedBackground: 'rgba(239, 68, 68, 0.08)',
      removedColor: '#fca5a5',
      wordAddedBackground: 'rgba(34, 197, 94, 0.2)',
      wordRemovedBackground: 'rgba(239, 68, 68, 0.2)',
      addedGutterBackground: 'rgba(34, 197, 94, 0.12)',
      removedGutterBackground: 'rgba(239, 68, 68, 0.12)',
      gutterBackground: '#1c1a17',
      gutterBackgroundDark: '#141210',
      highlightBackground: 'rgba(245, 158, 11, 0.1)',
      highlightGutterBackground: 'rgba(245, 158, 11, 0.15)',
      codeFoldGutterBackground: '#1c1a17',
      codeFoldBackground: '#221f1b',
      emptyLineBackground: '#141210',
      codeFoldContentColor: '#78716c',
    },
  },
}

export function DiffViewer({ file }: DiffViewerProps) {
  return (
    <div className="flex flex-col">
      <div className="border-b border-edge bg-surface-raised px-4 py-2">
        <span className="text-sm font-medium text-ink">{file.path}</span>
      </div>
      <div className="overflow-auto text-xs">
        <ReactDiffViewer
          oldValue={file.oldCode}
          newValue={file.newCode}
          splitView={true}
          useDarkTheme={true}
          styles={diffStyles}
        />
      </div>
    </div>
  )
}
