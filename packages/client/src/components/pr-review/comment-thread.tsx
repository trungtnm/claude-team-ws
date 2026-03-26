import { useState } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { useAddComment } from '@/hooks/use-reviews'
import type { PrComment } from '@/types'

interface CommentThreadProps {
  comments: PrComment[]
  sessionId: string
}

const AI_AUTHOR_PATTERNS = ['ai reviewer', 'ai-reviewer', 'github-actions', 'dependabot', 'copilot']

function isAiAuthor(author: string): boolean {
  const lower = author.toLowerCase()
  return AI_AUTHOR_PATTERNS.some(p => lower.includes(p)) || lower.endsWith('[bot]')
}

export function CommentThread({ comments, sessionId }: CommentThreadProps) {
  const [newComment, setNewComment] = useState('')
  const addComment = useAddComment()

  const handleSubmit = () => {
    if (!newComment.trim()) return
    addComment.mutate(
      { sessionId, body: newComment.trim() },
      {
        onSuccess: () => {
          toast.success('Comment added')
          setNewComment('')
        },
        onError: (err) => toast.error(err.message),
      },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-ink-secondary">
        Comments ({comments.length})
      </h3>

      {/* Comment list */}
      <div className="space-y-3">
        {comments.map((comment) => {
          const isAi = isAiAuthor(comment.author)
          return (
            <div
              key={comment.id}
              className={`rounded-lg border border-edge p-3 ${isAi ? 'bg-surface-elevated/50' : 'bg-surface-raised'}`}
            >
              <div className="mb-1.5 flex items-center gap-2">
                {isAi ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20">
                    <Bot className="h-3.5 w-3.5 text-accent" />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-elevated text-xs font-medium text-ink-secondary">
                    {comment.authorInitials}
                  </div>
                )}
                <span className="text-sm font-medium text-ink">{comment.author}</span>
                {comment.createdAt > 0 && (
                  <span className="text-xs text-ink-muted">
                    {formatDistanceToNow(comment.createdAt * 1000, { addSuffix: true })}
                  </span>
                )}
              </div>
              <p className="text-sm text-ink-secondary">{comment.text}</p>
            </div>
          )
        })}
        {comments.length === 0 && (
          <p className="text-xs text-ink-muted">No comments yet.</p>
        )}
      </div>

      {/* Add comment */}
      <div className="space-y-2">
        <Textarea
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="min-h-[60px]"
        />
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim() || addComment.isPending}
          >
            {addComment.isPending && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Comment
          </Button>
        </div>
      </div>
    </div>
  )
}
