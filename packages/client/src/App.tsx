import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Header } from '@/components/layout/header'
import { Sidebar } from '@/components/layout/sidebar'

// Lazy-loaded pages
const BoardPage = lazy(() => import('@/pages/board-page'))
const AgentsPage = lazy(() => import('@/pages/agents-page'))
const GraphPage = lazy(() => import('@/pages/graph-page'))
const SettingsPage = lazy(() => import('@/pages/settings-page'))

function Layout() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                Đang tải...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/board" replace />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="graph" element={<GraphPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  )
}
