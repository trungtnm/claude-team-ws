export interface Repo {
  id: string
  name: string
  gitUrl: string
  path: string
  defaultBranch: string
  linkMode: 'clone' | 'symlink'
  status: 'ready' | 'cloning' | 'error'
  lastCommit: { sha: string; message: string; author: string; time: number }
  uncommittedCount: number
}

const now = Math.floor(Date.now() / 1000)

export const repos: Repo[] = [
  {
    id: 'repo-1', name: 'backend', gitUrl: 'git@github.com:team/backend.git', path: '/Users/dev/repos/backend',
    defaultBranch: 'main', linkMode: 'clone', status: 'ready',
    lastCommit: { sha: 'a3f8c21', message: 'feat: add rate limit middleware', author: 'BlueLake', time: now - 7200 },
    uncommittedCount: 0,
  },
  {
    id: 'repo-2', name: 'frontend', gitUrl: 'git@github.com:team/frontend.git', path: '/Users/dev/repos/frontend',
    defaultBranch: 'main', linkMode: 'clone', status: 'ready',
    lastCommit: { sha: 'b7d2e45', message: 'fix: login form validation on Safari', author: 'SilverWolf', time: now - 18000 },
    uncommittedCount: 0,
  },
  {
    id: 'repo-3', name: 'mobile', gitUrl: '', path: '/Users/dev/mobile-app',
    defaultBranch: 'main', linkMode: 'symlink', status: 'ready',
    lastCommit: { sha: 'c9e1f33', message: 'chore: bump SDK to v4.2', author: 'Duc Pham', time: now - 86400 },
    uncommittedCount: 2,
  },
  {
    id: 'repo-4', name: 'shared-types', gitUrl: 'git@github.com:team/shared-types.git', path: '/Users/dev/repos/shared-types',
    defaultBranch: 'main', linkMode: 'clone', status: 'ready',
    lastCommit: { sha: 'd4a5b78', message: 'feat: add notification type definitions', author: 'Trung Tran', time: now - 43200 },
    uncommittedCount: 0,
  },
  {
    id: 'repo-5', name: 'docs', gitUrl: 'git@github.com:team/docs.git', path: '/Users/dev/repos/docs',
    defaultBranch: 'main', linkMode: 'clone', status: 'ready',
    lastCommit: { sha: 'e5b6c89', message: 'docs: update API specification', author: 'Minh Le', time: now - 172800 },
    uncommittedCount: 0,
  },
  {
    id: 'repo-6', name: 'infra', gitUrl: 'git@github.com:team/infra.git', path: '/Users/dev/repos/infra',
    defaultBranch: 'main', linkMode: 'clone', status: 'ready',
    lastCommit: { sha: 'f6c7d90', message: 'chore: update Docker base images', author: 'Trung Tran', time: now - 604800 },
    uncommittedCount: 0,
  },
]
