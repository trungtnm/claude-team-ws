export interface PrFile {
  path: string
  additions: number
  deletions: number
  oldCode: string
  newCode: string
}

export interface SecurityWarning {
  severity: 'high' | 'medium' | 'low'
  message: string
  file: string
  line: number
}

export interface PrComment {
  id: string
  author: string
  authorInitials: string
  text: string
  createdAt: number
}

export interface PrReview {
  prNumber: number
  title: string
  branch: string
  baseBranch: string
  epicTitle: string
  agentName: string
  files: PrFile[]
  aiReview: {
    ubsPass: boolean
    ubsIssues: number
    securityWarnings: SecurityWarning[]
    standardsPass: boolean
    verdict: string
  }
  comments: PrComment[]
}

const now = Math.floor(Date.now() / 1000)

export const prReview: PrReview = {
  prNumber: 45,
  title: 'feat: add login page redesign with GitHub SSO',
  branch: 'epic/login-redesign',
  baseBranch: 'main',
  epicTitle: 'Login Page Redesign',
  agentName: 'SilverWolf',
  files: [
    {
      path: 'src/pages/login-page.tsx',
      additions: 87,
      deletions: 23,
      oldCode: `import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async () => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    })
    if (!res.ok) {
      setError('Invalid API key')
      return
    }
    window.location.href = '/board'
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-80 space-y-4">
        <h1 className="text-2xl font-bold">Login</h1>
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="API Key"
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <Button onClick={handleLogin} className="w-full">
          Login
        </Button>
      </div>
    </div>
  )
}`,
      newCode: `import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Github, Key, Loader2 } from 'lucide-react'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)

  const handleGitHubSSO = () => {
    window.location.href = '/api/auth/github'
  }

  const handleApiKeyLogin = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, remember: rememberMe }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Invalid API key')
        return
      }
      window.location.href = '/board'
    } catch {
      setError('Connection failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-base">
      <Card className="w-96">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-surface-base font-bold text-lg">
            CT
          </div>
          <CardTitle className="text-xl">Claude Team Workspace</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleGitHubSSO} variant="outline" className="w-full gap-2">
            <Github className="h-4 w-4" />
            Continue with GitHub
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-ink-muted">or</span>
            <Separator className="flex-1" />
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Key className="absolute left-3 top-2.5 h-4 w-4 text-ink-muted" />
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter API key"
                className="pl-9"
                type="password"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-ink-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-edge"
              />
              Remember me for 30 days
            </label>

            {error && <p className="text-error text-sm">{error}</p>}

            <Button onClick={handleApiKeyLogin} className="w-full" disabled={!apiKey || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in with API Key'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}`,
    },
    {
      path: 'src/middleware/auth.ts',
      additions: 12,
      deletions: 3,
      oldCode: `  const maxAge = 7 * 24 * 60 * 60 * 1000 // 7 days
  res.cookie('ctw_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  })`,
      newCode: `  const remember = req.body.remember === true
  const maxAge = remember
    ? 30 * 24 * 60 * 60 * 1000  // 30 days
    : 7 * 24 * 60 * 60 * 1000   // 7 days
  res.cookie('ctw_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
  })`,
    },
    {
      path: 'src/routes/auth.ts',
      additions: 18,
      deletions: 2,
      oldCode: `router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)`,
      newCode: `router.get('/github', (_req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    return res.status(501).json({ error: 'GitHub SSO not configured' })
  }
  const redirectUri = encodeURIComponent(process.env.GITHUB_REDIRECT_URI || '')
  res.redirect(\`https://github.com/login/oauth/authorize?client_id=\${clientId}&redirect_uri=\${redirectUri}&scope=user:email\`)
})

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)`,
    },
  ],
  aiReview: {
    ubsPass: true,
    ubsIssues: 0,
    securityWarnings: [
      { severity: 'high', message: 'Missing CSRF token validation on GitHub OAuth callback', file: 'src/routes/auth.ts', line: 8 },
      { severity: 'medium', message: 'GitHub redirect URI should be validated against allowlist', file: 'src/routes/auth.ts', line: 6 },
    ],
    standardsPass: true,
    verdict: 'Changes Requested',
  },
  comments: [
    { id: 'c-1', author: 'Trung Tran', authorInitials: 'TT', text: 'Good catch on the remember me feature. Also add a logout button that clears the extended cookie.', createdAt: now - 7200 },
    { id: 'c-2', author: 'AI Reviewer', authorInitials: 'AI', text: 'The GitHub OAuth flow needs a state parameter to prevent CSRF attacks. Generate a random state, store in session, and verify on callback.', createdAt: now - 10800 },
  ],
}
