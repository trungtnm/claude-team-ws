import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

class GitService {
  private readonly repoPath: string

  constructor(repoPath: string) {
    this.repoPath = repoPath
  }

  async checkout(branch: string): Promise<void> {
    await this.exec(['checkout', branch])
  }

  async checkoutNew(branch: string): Promise<void> {
    await this.exec(['checkout', '-b', branch])
  }

  async pull(remote = 'origin', branch = 'main'): Promise<void> {
    await this.exec(['pull', remote, branch])
  }

  async push(remote = 'origin', branch = 'main', setUpstream = false): Promise<void> {
    const args = setUpstream
      ? ['push', '-u', remote, branch]
      : ['push', remote, branch]
    await this.exec(args)
  }

  async currentBranch(): Promise<string> {
    const { stdout } = await this.execRaw(['rev-parse', '--abbrev-ref', 'HEAD'])
    return stdout.trim()
  }

  async hasCommitsAhead(baseBranch: string): Promise<boolean> {
    const { stdout } = await this.execRaw(['rev-list', '--count', `${baseBranch}..HEAD`])
    return parseInt(stdout.trim(), 10) > 0
  }

  async deleteBranch(branch: string): Promise<void> {
    await this.exec(['branch', '-d', branch])
  }

  private async exec(args: string[]): Promise<void> {
    try {
      await execFileAsync('git', args, { cwd: this.repoPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`GitService command failed [${args.join(' ')}]: ${message}`)
    }
  }

  private async execRaw(args: string[]): Promise<{ stdout: string }> {
    try {
      return await execFileAsync('git', args, { cwd: this.repoPath })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`GitService command failed [${args.join(' ')}]: ${message}`)
    }
  }
}

export default GitService
