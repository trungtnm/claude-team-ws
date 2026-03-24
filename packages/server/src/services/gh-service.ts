import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export interface PrInfo {
  url: string
  number: number
  title: string
  state: string
  headBranch: string
  baseBranch: string
  additions: number
  deletions: number
  changedFiles: number
}

export interface PrFile {
  path: string
  additions: number
  deletions: number
  patch: string
}

export interface PrComment {
  id: number
  user: string
  body: string
  path?: string
  line?: number
  created_at: string
}

class GhService {
  // ── PR Info ────────────────────────────────────────────────────────────

  async getPr(prUrl: string): Promise<PrInfo> {
    try {
      const { stdout } = await execFile('gh', [
        'pr', 'view', prUrl,
        '--json', 'url,number,title,state,headRefName,baseRefName,additions,deletions,changedFiles',
      ])
      const data = JSON.parse(stdout)
      return {
        url: data.url,
        number: data.number,
        title: data.title,
        state: data.state,
        headBranch: data.headRefName,
        baseBranch: data.baseRefName,
        additions: data.additions,
        deletions: data.deletions,
        changedFiles: data.changedFiles,
      }
    } catch (err) {
      throw new Error(`GhService.getPr failed for ${prUrl}: ${(err as Error).message}`)
    }
  }

  // ── PR Diff ────────────────────────────────────────────────────────────

  async getPrFiles(prUrl: string): Promise<PrFile[]> {
    try {
      const { stdout: diffOutput } = await execFile('gh', [
        'pr', 'diff', prUrl,
      ])

      // Parse unified diff into per-file patches
      const files: PrFile[] = []
      const fileDiffs = diffOutput.split(/^diff --git /m).filter(Boolean)

      for (const fileDiff of fileDiffs) {
        const pathMatch = fileDiff.match(/a\/(.+?) b\//)
        if (!pathMatch) continue

        const path = pathMatch[1]
        const lines = fileDiff.split('\n')
        let additions = 0
        let deletions = 0

        for (const line of lines) {
          if (line.startsWith('+') && !line.startsWith('+++')) additions++
          if (line.startsWith('-') && !line.startsWith('---')) deletions++
        }

        files.push({
          path,
          additions,
          deletions,
          patch: fileDiff.slice(0, 5000), // Limit patch size
        })
      }

      return files
    } catch (err) {
      throw new Error(`GhService.getPrFiles failed for ${prUrl}: ${(err as Error).message}`)
    }
  }

  // ── PR Comments ────────────────────────────────────────────────────────

  async getPrComments(prUrl: string): Promise<PrComment[]> {
    try {
      const { stdout } = await execFile('gh', [
        'pr', 'view', prUrl,
        '--json', 'comments,reviewDecision',
        '--jq', '.comments',
      ])
      const comments = JSON.parse(stdout || '[]')
      return comments.map((c: Record<string, unknown>) => ({
        id: c.id,
        user: (c.author as Record<string, string>)?.login ?? 'unknown',
        body: c.body,
        created_at: c.createdAt,
      }))
    } catch (err) {
      throw new Error(`GhService.getPrComments failed for ${prUrl}: ${(err as Error).message}`)
    }
  }

  // ── Add Comment ────────────────────────────────────────────────────────

  async addComment(prUrl: string, body: string): Promise<void> {
    try {
      await execFile('gh', ['pr', 'comment', prUrl, '--body', body])
    } catch (err) {
      throw new Error(`GhService.addComment failed for ${prUrl}: ${(err as Error).message}`)
    }
  }

  // ── Merge ──────────────────────────────────────────────────────────────

  async merge(prUrl: string, strategy: 'squash' | 'merge' | 'rebase' = 'squash'): Promise<void> {
    try {
      await execFile('gh', ['pr', 'merge', prUrl, `--${strategy}`, '--delete-branch'])
    } catch (err) {
      throw new Error(`GhService.merge failed for ${prUrl}: ${(err as Error).message}`)
    }
  }

  // ── Create PR ──────────────────────────────────────────────────────────

  async createPr(cwd: string, title: string, body: string, baseBranch: string = 'main'): Promise<string> {
    try {
      const { stdout } = await execFile('gh', [
        'pr', 'create',
        '--title', title,
        '--body', body,
        '--base', baseBranch,
      ], { cwd })
      return stdout.trim() // Returns the PR URL
    } catch (err) {
      throw new Error(`GhService.createPr failed: ${(err as Error).message}`)
    }
  }
}

export const ghService = new GhService()
