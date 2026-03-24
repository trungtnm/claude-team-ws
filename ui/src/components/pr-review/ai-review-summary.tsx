import { CheckCircle, XCircle, Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { PrReview } from '@/data/pr-review'

interface AiReviewSummaryProps {
  aiReview: PrReview['aiReview']
}

const severityVariantMap: Record<string, 'error' | 'warning' | 'info'> = {
  high: 'error',
  medium: 'warning',
  low: 'info',
}

function getVerdictColor(verdict: string): string {
  const lower = verdict.toLowerCase()
  if (lower.includes('approved') || lower === 'approve') return 'text-success'
  if (lower.includes('request') || lower.includes('change')) return 'text-accent'
  return 'text-ink'
}

export function AiReviewSummary({ aiReview }: AiReviewSummaryProps) {
  const { ubsPass, ubsIssues, securityWarnings, standardsPass, verdict } = aiReview

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Review</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* UBS Check */}
        <div className="flex items-center gap-2">
          {ubsPass ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-error" />
          )}
          <span className="text-sm text-ink-secondary">
            UBS: {ubsPass ? 'Pass' : 'Fail'} ({ubsIssues} {ubsIssues === 1 ? 'issue' : 'issues'})
          </span>
        </div>

        {/* Security */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-ink-muted" />
            <span className="text-sm font-medium text-ink-secondary">
              Security ({securityWarnings.length})
            </span>
          </div>
          {securityWarnings.length > 0 && (
            <div className="ml-6 space-y-2">
              {securityWarnings.map((warning, index) => (
                <div key={index} className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Badge variant={severityVariantMap[warning.severity] ?? 'default'}>
                      {warning.severity}
                    </Badge>
                    <span className="text-sm text-ink-secondary">{warning.message}</span>
                  </div>
                  <span className="text-xs text-ink-muted">
                    {warning.file}:{warning.line}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Standards */}
        <div className="flex items-center gap-2">
          {standardsPass ? (
            <CheckCircle className="h-4 w-4 text-success" />
          ) : (
            <XCircle className="h-4 w-4 text-error" />
          )}
          <span className="text-sm text-ink-secondary">
            Standards: {standardsPass ? 'Pass' : 'Fail'}
          </span>
        </div>

        {/* Verdict */}
        <div className="border-t border-edge pt-3">
          <span className={`text-sm font-bold ${getVerdictColor(verdict)}`}>
            Verdict: {verdict}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
