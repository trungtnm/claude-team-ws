import React, { Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { useAuth } from '@/hooks/use-auth'
import { Header } from '@/components/layout/header'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Lazy-loaded pages
const LoginPage = React.lazy(() => import('@/pages/login-page'))
const BoardPage = React.lazy(() => import('@/pages/board-page'))
const CapturesPage = React.lazy(() => import('@/pages/captures-page'))
const AgentsPage = React.lazy(() => import('@/pages/agents-page'))
const AgentStreamPage = React.lazy(() => import('@/pages/agent-stream-page'))
const GraphPage = React.lazy(() => import('@/pages/graph-page'))
const SettingsPage = React.lazy(() => import('@/pages/settings-page'))
const ReviewPage = React.lazy(() => import('@/pages/review-page'))

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-surface-base gap-3">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full border-2 border-edge" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin" />
      </div>
      <span className="text-xs text-ink-disabled tracking-wide">Loading</span>
    </div>
  )
}

function RequireAuth() {
  const { data: user, isLoading, isError } = useAuth()

  if (isLoading) return <PageLoader />
  if (isError || !user) return <Navigate to="/login" replace />

  return (
    <div className="flex flex-col h-screen bg-surface-base">
      <Header />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/projects/:projectId">
            <Route path="board" element={<BoardPage />} />
            <Route path="captures" element={<CapturesPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="agents/:sessionId" element={<AgentStreamPage />} />
            <Route path="graph" element={<GraphPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="review/:sessionId" element={<ReviewPage />} />
            <Route index element={<Navigate to="board" replace />} />
          </Route>
          <Route path="/" element={<Navigate to="/projects/default/board" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          style: {
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          },
        }}
      />
    </QueryClientProvider>
  )
}
