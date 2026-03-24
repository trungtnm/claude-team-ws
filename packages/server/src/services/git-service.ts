/**
 * Git CLI wrapper — all operations via execFile (never exec) to prevent shell injection.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT = 60_000 // 60s for most operations
const CLONE_TIMEOUT = 300_000 // 5min for clone

export const gitService = {
  /** Clone a repository into a target directory */
  async clone(gitUrl: string, targetDir: string): Promise<void> {
    try {
      await execFileAsync('git', ['clone', gitUrl, targetDir], { timeout: CLONE_TIMEOUT })
    } catch (err) {
      throw new Error(`GitService.clone failed for ${gitUrl}: ${(err as Error).message}`)
    }
  },

  /** Check if a directory is a git repository */
  async isGitRepo(dir: string): Promise<boolean> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], { timeout: GIT_TIMEOUT })
      return stdout.trim() === 'true'
    } catch {
      return false
    }
  },

  /** Get the current branch name */
  async currentBranch(dir: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: GIT_TIMEOUT })
      return stdout.trim()
    } catch (err) {
      throw new Error(`GitService.currentBranch failed: ${(err as Error).message}`)
    }
  },

  /** Create and checkout a new branch */
  async checkoutNew(dir: string, branchName: string): Promise<void> {
    try {
      await execFileAsync('git', ['-C', dir, 'checkout', '-b', branchName], { timeout: GIT_TIMEOUT })
    } catch (err) {
      throw new Error(`GitService.checkoutNew failed for ${branchName}: ${(err as Error).message}`)
    }
  },

  /** Checkout an existing branch */
  async checkout(dir: string, branchName: string): Promise<void> {
    try {
      await execFileAsync('git', ['-C', dir, 'checkout', branchName], { timeout: GIT_TIMEOUT })
    } catch (err) {
      throw new Error(`GitService.checkout failed for ${branchName}: ${(err as Error).message}`)
    }
  },

  /** Pull latest changes from remote */
  async pull(dir: string, remote = 'origin', branch?: string): Promise<{ result: string; newCommits: number; head: string }> {
    try {
      const args = ['-C', dir, 'pull', remote]
      if (branch) args.push(branch)

      const { stdout } = await execFileAsync('git', args, { timeout: GIT_TIMEOUT })

      // Get current head after pull
      const { stdout: headStdout } = await execFileAsync('git', ['-C', dir, 'rev-parse', '--short', 'HEAD'], { timeout: GIT_TIMEOUT })
      const head = headStdout.trim()

      // Determine result type
      const result = stdout.includes('Already up to date') ? 'up-to-date'
        : stdout.includes('Fast-forward') ? 'fast-forward'
        : 'merge'

      // Count new commits (rough estimate from pull output)
      const commitMatch = stdout.match(/(\d+) files? changed/)
      const newCommits = commitMatch ? 1 : 0

      return { result, newCommits, head }
    } catch (err) {
      throw new Error(`GitService.pull failed: ${(err as Error).message}`)
    }
  },

  /** Push branch to remote */
  async push(dir: string, remote = 'origin', branch?: string): Promise<void> {
    try {
      const args = ['-C', dir, 'push', remote]
      if (branch) args.push(branch)
      await execFileAsync('git', args, { timeout: GIT_TIMEOUT })
    } catch (err) {
      throw new Error(`GitService.push failed: ${(err as Error).message}`)
    }
  },

  /** Check if branch has commits ahead of remote */
  async hasCommitsAhead(dir: string, branch?: string): Promise<boolean> {
    try {
      const currentBranch = branch || (await gitService.currentBranch(dir))
      const { stdout } = await execFileAsync('git', ['-C', dir, 'rev-list', '--count', `origin/${currentBranch}..${currentBranch}`], { timeout: GIT_TIMEOUT })
      return parseInt(stdout.trim(), 10) > 0
    } catch {
      return false
    }
  },

  /** Delete a branch (local and optionally remote) */
  async deleteBranch(dir: string, branchName: string, deleteRemote = false): Promise<void> {
    try {
      await execFileAsync('git', ['-C', dir, 'branch', '-D', branchName], { timeout: GIT_TIMEOUT })
      if (deleteRemote) {
        await execFileAsync('git', ['-C', dir, 'push', 'origin', '--delete', branchName], { timeout: GIT_TIMEOUT })
      }
    } catch (err) {
      throw new Error(`GitService.deleteBranch failed for ${branchName}: ${(err as Error).message}`)
    }
  },

  /** List all branches with ahead/behind counts */
  async listBranches(dir: string): Promise<Array<{
    name: string
    isDefault: boolean
    ahead: number
    behind: number
  }>> {
    try {
      // Get default branch
      const defaultBranch = await gitService.currentBranch(dir)

      // List all local branches
      const { stdout } = await execFileAsync('git', ['-C', dir, 'branch', '--format=%(refname:short)'], { timeout: GIT_TIMEOUT })
      const branches = stdout.trim().split('\n').filter(Boolean)

      const result = []
      for (const name of branches) {
        let ahead = 0
        let behind = 0
        try {
          const { stdout: aheadStr } = await execFileAsync('git', ['-C', dir, 'rev-list', '--count', `origin/${name}..${name}`], { timeout: GIT_TIMEOUT })
          ahead = parseInt(aheadStr.trim(), 10) || 0
          const { stdout: behindStr } = await execFileAsync('git', ['-C', dir, 'rev-list', '--count', `${name}..origin/${name}`], { timeout: GIT_TIMEOUT })
          behind = parseInt(behindStr.trim(), 10) || 0
        } catch {
          // Remote tracking branch may not exist
        }

        result.push({
          name,
          isDefault: name === defaultBranch,
          ahead,
          behind,
        })
      }

      return result
    } catch (err) {
      throw new Error(`GitService.listBranches failed: ${(err as Error).message}`)
    }
  },

  /** Get last commit info */
  async lastCommit(dir: string): Promise<{ hash: string; message: string; date: string }> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', dir, 'log', '-1', '--format=%H%x00%s%x00%ai'], { timeout: GIT_TIMEOUT })
      const [hash, message, date] = stdout.trim().split('\0')
      return { hash: hash?.slice(0, 7) ?? '', message: message ?? '', date: date ?? '' }
    } catch (err) {
      throw new Error(`GitService.lastCommit failed: ${(err as Error).message}`)
    }
  },

  /** Get working tree status (clean, dirty, etc.) */
  async status(dir: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync('git', ['-C', dir, 'status', '--porcelain'], { timeout: GIT_TIMEOUT })
      return stdout.trim() === '' ? 'clean' : 'dirty'
    } catch {
      return 'unknown'
    }
  },
}
