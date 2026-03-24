import { Outlet } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Header } from './header'
import { AgentAlertBar } from './agent-alert-bar'

export function Layout() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <AgentAlertBar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: '#1c1a17',
            border: '1px solid rgba(168,162,158,0.12)',
            color: '#f5f0eb',
          },
        }}
      />
    </div>
  )
}
