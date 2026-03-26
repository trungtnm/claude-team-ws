import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, GitMerge, GitBranch, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PrReviewLayout } from '@/components/pr-review/pr-review-layout'
import { useReview, useMergePr } from '@/hooks/use-reviews'
import { toast } from 'sonner'

export default function PrReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const { data: prReview, isLoading, error } = useReview(sessionId ?? '')
  const mergePr = useMergePr()

  const handleApprove = () => {
    toast.success('PR approved')
  }

  const handleRequestChanges = () => {
    toast.info('Changes requested')
  }

  const handleMerge = (strategy: 'squash' | 'merge' | 'rebase') => {
    if (!sessionId) return
    mergePr.mutate(
      { sessionId, strategy },
      {
        onSuccess: () => toast.success(`PR ${strategy === 'squash' ? 'squash-merged' : strategy === 'rebase' ? 'rebased and merged' : 'merged'} successfully`),
        onError: (err) => toast.error(err.message),
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </div>
    )
  }

  if (error || !prReview) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-ink-muted">{error?.message ?? 'Review not found'}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to="/board">Back to Board</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-edge px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/board">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            <div className="h-4 w-px bg-edge" />
            <span className="text-sm font-medium text-ink">
              #{prReview.prNumber} {prReview.title}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="border border-success/50 bg-success/10 text-success hover:bg-success/20"
              onClick={handleApprove}
            >
              Approve
            </Button>
            <Button
              size="sm"
              className="border border-warning/50 bg-warning/10 text-warning hover:bg-warning/20"
              onClick={handleRequestChanges}
            >
              Request Changes
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" disabled={mergePr.isPending}>
                  {mergePr.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitMerge className="h-4 w-4" />}
                  Merge
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleMerge('squash')}>
                  <GitMerge className="h-4 w-4" />
                  Squash and merge
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMerge('merge')}>
                  <GitMerge className="h-4 w-4" />
                  Create merge commit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleMerge('rebase')}>
                  <GitBranch className="h-4 w-4" />
                  Rebase and merge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Context line: Epic -> Agent + branch */}
        <div className="mt-2 ml-[72px] flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-ink-muted">
            Epic: <span className="text-ink-secondary">{prReview.epicTitle}</span>
            <span className="mx-1.5 text-ink-disabled">&rarr;</span>
            Agent: <span className="text-ink-secondary">{prReview.agentName}</span>
          </span>
          <Badge variant="outline" className="text-[10px] font-mono gap-1">
            <GitBranch className="h-3 w-3" />
            {prReview.branch} &rarr; {prReview.baseBranch}
          </Badge>
        </div>
      </div>

      {/* Body */}
      <PrReviewLayout prReview={prReview} />
    </div>
  )
}
