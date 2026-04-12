import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export class GitService {
  constructor(private readonly cwd: string) {}

  private async exec(args: string[], repoPath?: string): Promise<string> {
    try {
      const { stdout } = await execFile('git', args, {
        cwd: repoPath ?? this.cwd,
        timeout: 30_000,
      })
      return stdout.trim()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`GitService.exec failed for [git ${args.join(' ')}]: ${message}`)
    }
  }

  async clone(url: string, destPath: string, branch?: string): Promise<void> {
    const args = ['clone', url, destPath]
    if (branch) args.push('--branch', branch)
    await this.exec(args)
  }

  async pull(repoPath: string): Promise<{ result: string; newCommits: number; head: string }> {
    const beforeHead = await this.exec(['rev-parse', 'HEAD'], repoPath)
    const output = await this.exec(['pull', '--ff-only'], repoPath)
    const afterHead = await this.exec(['rev-parse', 'HEAD'], repoPath)

    const result = beforeHead === afterHead ? 'up-to-date' : 'fast-forward'
    let newCommits = 0
    if (beforeHead !== afterHead) {
      const countOutput = await this.exec(['rev-list', '--count', `${beforeHead}..${afterHead}`], repoPath)
      newCommits = parseInt(countOutput, 10) || 0
    }

    return { result, newCommits, head: afterHead.slice(0, 7) }
  }

  async branches(repoPath: string): Promise<Array<{ name: string; isDefault: boolean; ahead: number; behind: number }>> {
    const defaultBranch = await this.exec(['symbolic-ref', 'refs/remotes/origin/HEAD', '--short'], repoPath)
      .then(out => out.replace('origin/', ''))
      .catch(() => 'main')

    const output = await this.exec(['branch', '-a', '--format=%(refname:short)'], repoPath)
    const branchNames = output.split('\n').filter(b => b && !b.startsWith('origin/'))

    return branchNames.map(name => ({
      name,
      isDefault: name === defaultBranch,
      ahead: 0,
      behind: 0,
    }))
  }

  async checkout(branchName: string, repoPath: string): Promise<void> {
    await this.exec(['checkout', branchName], repoPath)
  }

  async checkoutNewBranch(branchName: string, repoPath: string): Promise<void> {
    await this.exec(['checkout', '-b', branchName], repoPath)
  }

  // ─── Worktree Operations ──────────────────────────────────────────────────

  async worktreeAdd(repoPath: string, worktreePath: string, branchName: string): Promise<void> {
    await this.exec(['worktree', 'add', worktreePath, '-b', branchName], repoPath)
  }

  async worktreeRemove(repoPath: string, worktreePath: string): Promise<void> {
    try {
      await this.exec(['worktree', 'remove', worktreePath, '--force'], repoPath)
    } catch (err) {
      // Worktree may already be removed or path may not exist
      const message = err instanceof Error ? err.message : String(err)
      if (!message.includes('is not a working tree')) {
        throw err
      }
    }
  }

  async worktreeList(repoPath: string): Promise<Array<{ path: string; branch: string; head: string }>> {
    const output = await this.exec(['worktree', 'list', '--porcelain'], repoPath)
    const worktrees: Array<{ path: string; branch: string; head: string }> = []
    let current: { path: string; branch: string; head: string } = { path: '', branch: '', head: '' }

    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        current = { path: line.slice(9), branch: '', head: '' }
      } else if (line.startsWith('HEAD ')) {
        current.head = line.slice(5, 12)
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(7).replace('refs/heads/', '')
      } else if (line === '') {
        if (current.path) worktrees.push(current)
        current = { path: '', branch: '', head: '' }
      }
    }
    if (current.path) worktrees.push(current)

    return worktrees
  }

  async worktreePrune(repoPath: string): Promise<void> {
    await this.exec(['worktree', 'prune'], repoPath)
  }

  async deleteBranch(branchName: string, repoPath: string): Promise<void> {
    await this.exec(['branch', '-D', branchName], repoPath)
  }

  async pushBranch(branchName: string, repoPath: string, remote = 'origin'): Promise<void> {
    await this.exec(['push', '-u', remote, branchName], repoPath)
  }

  // ─── Commit History ─────────────────────────────────────────────────────────

  async lastCommit(repoPath: string): Promise<{ hash: string; message: string; author: string; date: number }> {
    const output = await this.exec(
      ['log', '-1', '--format=%H|%s|%an|%at'],
      repoPath,
    )
    const [hash, message, author, dateStr] = output.split('|')
    return {
      hash: hash.slice(0, 7),
      message,
      author,
      date: parseInt(dateStr, 10),
    }
  }
}
