import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-4" style={{ backgroundColor: 'var(--surface-base)' }}>
          <p className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>Something went wrong</p>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-md px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: 'var(--surface-base)' }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
