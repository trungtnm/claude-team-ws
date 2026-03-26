import { useState } from 'react'
import { Send } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { FileTree } from './file-tree'
import { DiffViewer } from './diff-viewer'
import { AiReviewSummary } from './ai-review-summary'
import { CommentThread } from './comment-thread'
import type { PrReviewData } from '@/types'
import { toast } from 'sonner'

interface PrReviewLayoutProps {
  prReview: PrReviewData
}

export function PrReviewLayout({ prReview }: PrReviewLayoutProps) {
  const [selectedFilePath, setSelectedFilePath] = useState(prReview.files[0]?.path ?? '')

  const selectedFile = prReview.files.find((f) => f.path === selectedFilePath) ?? prReview.files[0]

  const handleSendToAgent = () => {
    toast.info('Feedback sent to agent for review')
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px] overflow-hidden">
      {/* Left panel: file tree + file path + diff */}
      <div className="flex h-full flex-col overflow-hidden border-r border-edge">
        <ScrollArea className="max-h-48 shrink-0">
          <FileTree
            files={prReview.files}
            selectedFile={selectedFilePath}
            onSelectFile={setSelectedFilePath}
          />
        </ScrollArea>
        <Separator />
        {/* Selected file path mini header */}
        {selectedFile && (
          <div className="flex items-center gap-2 border-b border-edge bg-surface-elevated/50 px-4 py-1.5">
            <span className="text-xs font-mono text-ink-muted truncate">{selectedFile.path}</span>
            <span className="text-[10px] text-ink-disabled ml-auto shrink-0">
              +{selectedFile.additions} -{selectedFile.deletions}
            </span>
          </div>
        )}
        <div className="flex-1 overflow-auto">
          {selectedFile && <DiffViewer file={selectedFile} />}
        </div>
      </div>

      {/* Right panel: AI review + comments + send to agent */}
      <div className="flex h-full flex-col overflow-hidden">
        <div className="p-4 shrink-0">
          <AiReviewSummary aiReview={prReview.aiReview} />
        </div>
        <Separator />
        <ScrollArea className="flex-1">
          <div className="p-4">
            <CommentThread
              comments={prReview.comments}
              sessionId={prReview.sessionId}
            />
          </div>
        </ScrollArea>
        <Separator />
        <div className="p-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={handleSendToAgent}
          >
            <Send className="h-3.5 w-3.5" />
            Send to Agent
          </Button>
        </div>
      </div>
    </div>
  )
}
