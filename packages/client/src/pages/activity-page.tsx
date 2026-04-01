import {
  Activity,
  GitPullRequest,
  GitMerge,
  Lightbulb,
  Bot,
  CheckCircle2,
  XCircle,
  ArrowRight,
  TrendingUp,
  Zap,
  Inbox,
  BookOpen,
  Loader2,
} from 'lucide-react'
import { useActivityQuery } from '@/hooks/use-activity'
import { useMetricsQuery } from '@/hooks/use-metrics'
import type { ActivityAction, ActivityEntry, ProjectMetrics } from '@/types'

// ─── Config ──────────────────────────────────────────────────────────────────

const actionConfig: Record<ActivityAction, { icon: typeof Activity; label: string; color: string }> = {
  capture_created: { icon: Lightbulb, label: 'captured an idea', color: 'text-warning' },
  epic_created: { icon: Zap, label: 'created an epic', color: 'text-info' },
  session_started: { icon: Bot, label: 'started a session', color: 'text-accent' },
  session_completed: { icon: CheckCircle2, label: 'completed a session', color: 'text-success' },
  session_failed: { icon: XCircle, label: 'session failed', color: 'text-error' },
  pr_created: { icon: GitPullRequest, label: 'opened a PR', color: 'text-info' },
  pr_merged: { icon: GitMerge, label: 'merged a PR', color: 'text-[#a855f7]' },
  rule_created: { icon: BookOpen, label: 'created a rule', color: 'text-ink-secondary' },
  bead_status_changed: { icon: ArrowRight, label: 'moved a bead', color: 'text-ink-secondary' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Math.floor(Date.now() / 1000) - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

function getInitials(name: string | null): string {
  if (!name) return '??'
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function parseDetails(entry: ActivityEntry): Record<string, unknown> {
  if (!entry.details) return {}
  try {
    return JSON.parse(entry.details) as Record<string, unknown>
  } catch {
    return {}
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-3">
      <p className="text-[11px] font-medium text-ink-muted uppercase tracking-wide">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color ?? 'text-ink'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-muted">{sub}</p>}
    </div>
  )
}

function StatusBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 text-xs text-ink-muted truncate">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-surface-elevated overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-6 text-xs text-ink-secondary text-right">{count}</span>
    </div>
  )
}

function ActivityFeed({ activity, isLoading }: { activity: ActivityEntry[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-ink-muted gap-2">
        <Activity className="h-8 w-8 opacity-30" />
        <p className="text-sm">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {activity.map((entry) => {
        const config = actionConfig[entry.action] ?? actionConfig.bead_status_changed
        const Icon = config.icon
        const details = parseDetails(entry)

        return (
          <div
            key={entry.id}
            className="group flex items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 hover:bg-surface-raised transition-colors"
          >
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-surface-base mt-0.5 bg-accent"
            >
              {getInitials(entry.userName)}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-ink">
                <span className="font-medium">{entry.userName ?? 'System'}</span>
                <span className="text-ink-muted"> {config.label}</span>
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Icon className={`h-3 w-3 ${config.color} shrink-0`} />
                <p className="text-xs text-ink-secondary truncate">
                  {(details.title as string) ?? (details.name as string) ?? (details.session_id as string) ?? ''}
                </p>
              </div>
              {entry.action === 'session_failed' && details.error != null ? (
                <p className="text-[11px] text-error/80 mt-0.5 truncate">{String(details.error)}</p>
              ) : null}
            </div>

            <span className="text-[11px] text-ink-muted shrink-0 mt-0.5">{timeAgo(entry.createdAt)}</span>
          </div>
        )
      })}
    </div>
  )
}

function MetricsPanel({ metrics, isLoading }: { metrics: ProjectMetrics | undefined; isLoading: boolean }) {
  if (isLoading || !metrics) {
    return (
      <div className="flex items-center justify-center h-32 text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold text-ink-secondary uppercase tracking-wide">Project Health</h2>

      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Success Rate"
          value={`${metrics.sessions.successRate}%`}
          sub={`${metrics.sessions.completed}/${metrics.sessions.completed + metrics.sessions.failed} finished`}
          color="text-success"
        />
        <MetricCard
          label="Active Agents"
          value={metrics.sessions.running}
          sub="currently running"
          color="text-accent"
        />
        <MetricCard
          label="Total Sessions"
          value={metrics.sessions.total}
          sub={`${metrics.sessions.failed} failed`}
        />
        <MetricCard
          label="PR Cycle"
          value={`${metrics.prs.avgCycleHours}h`}
          sub="avg to merge"
          color="text-info"
        />
      </div>

      {/* Epic Progress */}
      <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-4">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4 text-accent" />
          <h3 className="text-sm font-medium text-ink">Epic Progress</h3>
          <span className="text-xs text-ink-muted ml-auto">{metrics.epics.total} total</span>
        </div>
        <div className="space-y-2">
          <StatusBar label="Done" count={metrics.epics.byStatus.done} total={metrics.epics.total} color="bg-success" />
          <StatusBar label="In Review" count={metrics.epics.byStatus.in_review} total={metrics.epics.total} color="bg-info" />
          <StatusBar label="In Progress" count={metrics.epics.byStatus.in_progress} total={metrics.epics.total} color="bg-accent" />
          <StatusBar label="Ready" count={metrics.epics.byStatus.ready} total={metrics.epics.total} color="bg-ink-muted" />
          <StatusBar label="Blocked" count={metrics.epics.byStatus.blocked} total={metrics.epics.total} color="bg-error" />
        </div>
      </div>

      {/* Capture Pipeline */}
      <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-4">
        <div className="flex items-center gap-2 mb-3">
          <Inbox className="h-4 w-4 text-warning" />
          <h3 className="text-sm font-medium text-ink">Capture Pipeline</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-xl font-bold text-warning">{metrics.captures.pending}</p>
            <p className="text-[11px] text-ink-muted">Pending</p>
          </div>
          <div>
            <p className="text-xl font-bold text-success">{metrics.captures.triaged}</p>
            <p className="text-[11px] text-ink-muted">Triaged</p>
          </div>
          <div>
            <p className="text-xl font-bold text-ink-muted">{metrics.captures.deferred}</p>
            <p className="text-[11px] text-ink-muted">Deferred</p>
          </div>
        </div>
      </div>

      {/* PR Summary */}
      <div className="rounded-[var(--radius-md)] border border-edge bg-surface-raised p-4">
        <div className="flex items-center gap-2 mb-3">
          <GitPullRequest className="h-4 w-4 text-info" />
          <h3 className="text-sm font-medium text-ink">Pull Requests</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-[var(--radius-sm)] bg-surface-elevated p-2">
            <p className="text-lg font-bold text-info">{metrics.prs.open}</p>
            <p className="text-[11px] text-ink-muted">Open</p>
          </div>
          <div className="rounded-[var(--radius-sm)] bg-surface-elevated p-2">
            <p className="text-lg font-bold text-[#a855f7]">{metrics.prs.merged}</p>
            <p className="text-[11px] text-ink-muted">Merged</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { data: activityData, isLoading: activityLoading } = useActivityQuery()
  const { data: metricsData, isLoading: metricsLoading } = useMetricsQuery()

  return (
    <div className="flex flex-1 flex-col overflow-hidden p-6">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold text-ink">Activity</h1>
      </div>

      <div className="flex flex-1 gap-6 overflow-hidden">
        {/* Left: Activity Feed (45%) */}
        <div className="flex flex-col w-[45%] min-w-0">
          <div className="flex-1 overflow-y-auto pr-2">
            <ActivityFeed
              activity={activityData?.activity ?? []}
              isLoading={activityLoading}
            />
          </div>
        </div>

        {/* Right: Metrics (55%) */}
        <div className="w-[55%] overflow-y-auto pr-1">
          <MetricsPanel metrics={metricsData} isLoading={metricsLoading} />
        </div>
      </div>
    </div>
  )
}
