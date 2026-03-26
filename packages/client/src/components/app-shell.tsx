import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Layout } from './layout/layout'
import { useSocketConnection } from '@/hooks/use-socket-connection'
import { useSocketQuerySync } from '@/hooks/use-socket-query-sync'

const BoardPage = lazy(() =>
  import('@/pages/board-page').then((m) => ({ default: m.BoardPage })),
)
const CapturesPage = lazy(() => import('@/pages/captures-page'))
const AgentsPage = lazy(() => import('@/pages/agents-page'))
const AgentStreamPage = lazy(() => import('@/pages/agent-stream-page'))
const GraphPage = lazy(() => import('@/pages/graph-page'))
const SettingsPage = lazy(() => import('@/pages/settings-page'))
const PrReviewPage = lazy(() => import('@/pages/pr-review-page'))

export function AppShell() {
  useSocketConnection()
  useSocketQuerySync()

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center text-ink-muted">
          Loading...
        </div>
      }
    >
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/board" replace />} />
          <Route path="/board" element={<BoardPage />} />
          <Route path="/captures" element={<CapturesPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/:sessionId" element={<AgentStreamPage />} />
          <Route path="/graph" element={<GraphPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/review/:sessionId" element={<PrReviewPage />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
