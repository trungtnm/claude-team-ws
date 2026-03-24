import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ChevronDown, GitMerge, GitBranch, FileCode, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useReviewDetailQuery, useAddCommentMutation, useMergePrMutation } from '@/hooks/use-reviews'

export default function ReviewPage() {
  const { projectId, sessionId } = useParams<{ projectId: string; sessionId: string }>()
  const { data, isLoading, error } = useReviewDetailQuery(projectId ?? '', sessionId ?? '')
  const addComment = useAddCommentMutation(projectId ?? '', sessionId ?? '')
  const mergePr = useMergePrMutation(projectId ?? '', sessionId ?? '')
  const [commentBody, setCommentBody] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="relative h-6 w-6">
          <div className="absolute inset-0 rounded-full border-2 border-edge" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
        </div>
        <span className="text-xs text-ink-disabled">Loading review</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <div className="h-10 w-10 rounded-full bg-error/10 flex items-center justify-center">
          <GitMerge className="h-5 w-5 text-error" />
        </div>
        <p className="text-sm text-ink-secondary">Failed to load review</p>
        <p className="text-xs text-ink-disabled">{error?.message ?? 'Review not found'}</p>
      </div>
    )
  }

  const { pr, diff, human_comments } = data

  const handleComment = () => {
    if (!commentBody.trim()) return
    addComment.mutate(
      { file: selectedFile ?? undefined, body: commentBody },
      { onSuccess: () => setCommentBody('') },
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/projects/${projectId}/board`}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="h-4 w-px bg-edge" />
            <span className="text-sm font-medium text-ink">
              #{pr.number} {pr.title}
            </span>
            <Badge variant="outline" className="text-[10px] font-mono gap-1">
              <GitBranch className="h-3 w-3" />
              {pr.branch}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-muted">
              +{pr.additions} -{pr.deletions}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm">
                  <GitMerge className="h-4 w-4" />
                  Merge
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => mergePr.mutate('squash')}>
                  Squash and merge
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => mergePr.mutate('merge')}>
                  Create merge commit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => mergePr.mutate('rebase')}>
                  Rebase and merge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Body — file tree + diff + comments */}
      <div className="flex flex-1 overflow-hidden">
        {/* File tree sidebar */}
        <div className="w-64 border-r border-edge overflow-y-auto p-2">
          <p className="text-xs font-medium text-ink-muted px-2 mb-2">
            {diff.files.length} files changed
          </p>
          {diff.files.map((file) => (
            <button
              key={file.path}
              className={`w-full text-left px-2 py-1.5 rounded text-xs truncate flex items-center gap-1.5 hover:bg-surface-raised ${
                selectedFile === file.path ? 'bg-surface-raised text-ink' : 'text-ink-secondary'
              }`}
              onClick={() => setSelectedFile(file.path)}
            >
              <FileCode className="h-3 w-3 shrink-0" />
              <span className="truncate">{file.path.split('/').pop()}</span>
              <span className="ml-auto text-[10px] text-success">+{file.additions}</span>
              <span className="text-[10px] text-error">-{file.deletions}</span>
            </button>
          ))}
        </div>

        {/* Diff viewer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-4">
              {selectedFile ? (
                <div>
                  <p className="text-sm font-mono text-ink-secondary mb-2">{selectedFile}</p>
                  <div className="rounded-[var(--radius-md)] bg-surface-base border border-edge overflow-hidden">
                    <div className="overflow-x-auto">
                      {(diff.files.find((f) => f.path === selectedFile)?.patch ?? '').split('\n').map((line, i) => {
                        const isAddition = line.startsWith('+') && !line.startsWith('+++')
                        const isDeletion = line.startsWith('-') && !line.startsWith('---')
                        const isHeader = line.startsWith('@@') || line.startsWith('diff') || line.startsWith('index') || line.startsWith('---') || line.startsWith('+++')
                        return (
                          <div
                            key={i}
                            className={`px-3 py-0 text-xs font-mono leading-5 whitespace-pre ${
                              isAddition ? 'bg-green-500/10 text-green-400' :
                              isDeletion ? 'bg-red-500/10 text-red-400' :
                              isHeader ? 'bg-surface-elevated text-ink-muted' :
                              'text-ink-secondary'
                            }`}
                          >
                            {line || '\u00A0'}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20">
                  <FileCode className="h-10 w-10 text-ink-disabled mb-3" />
                  <p className="text-sm text-ink-muted">Select a file to view its diff</p>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Comments section */}
          <div className="border-t border-edge p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-ink-muted" />
              <span className="text-sm font-medium text-ink">
                Comments ({human_comments.length})
              </span>
            </div>

            {human_comments.map((comment) => (
              <div key={comment.id} className="mb-3 rounded bg-surface-base p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-ink-secondary">{comment.user}</span>
                  <span className="text-[10px] text-ink-muted">{comment.created_at}</span>
                </div>
                <p className="text-sm text-ink">{comment.body}</p>
              </div>
            ))}

            <div className="flex gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                className="text-sm min-h-[60px]"
              />
              <Button
                size="sm"
                onClick={handleComment}
                disabled={!commentBody.trim() || addComment.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
