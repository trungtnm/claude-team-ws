import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from './lib/api-error'
import { ErrorBoundary } from './components/error-boundary'
import { AuthProvider } from './providers/auth-provider'
import { ProjectProvider } from './providers/project-provider'
import { ProtectedRoute } from './components/auth/protected-route'
import { AppShell } from './components/app-shell'
import { LoginPage } from './pages/login-page'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry on auth errors — the global 401 handler will redirect
        if (error instanceof ApiError && error.isUnauthorized) return false
        return failureCount < 1
      },
      refetchOnWindowFocus: true,
      gcTime: 5 * 60 * 1000,
    },
    mutations: {
      retry: 0,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <ProjectProvider>
                      <AppShell />
                    </ProjectProvider>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
