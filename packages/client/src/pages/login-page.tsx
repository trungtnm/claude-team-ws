import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyRound, Loader2 } from 'lucide-react'
import { useLogin } from '@/hooks/use-auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const navigate = useNavigate()
  const login = useLogin()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await login.mutateAsync({ api_key: apiKey })
      navigate('/projects/default/board')
    } catch {
      // Error handled by mutation state
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-surface-base px-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent/15 flex items-center justify-center shadow-[0_0_24px_rgba(245,158,11,0.15)]">
            <span className="text-accent font-bold text-xl">C</span>
          </div>
        </div>

        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-ink tracking-tight">
            Claude Team Workspace
          </h1>
          <p className="mt-2 text-sm text-ink-secondary">
            Sign in with your API key to continue
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="apiKey" className="text-sm font-medium text-ink-secondary">
              API Key
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-disabled" />
              <Input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoFocus
                autoComplete="current-password"
                className="pl-10 h-11"
                placeholder="ctw-..."
              />
            </div>
          </div>

          {login.isError && (
            <div className="rounded-[var(--radius-md)] bg-error/10 border border-error/20 px-3 py-2">
              <p className="text-sm text-error">
                {login.error instanceof Error ? login.error.message : 'Invalid API key'}
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={login.isPending || !apiKey.trim()}
            className="w-full h-11"
          >
            {login.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>

        {/* Footer hint */}
        <p className="mt-6 text-center text-xs text-ink-disabled">
          Ask your team admin for an API key
        </p>
      </div>
    </div>
  )
}
