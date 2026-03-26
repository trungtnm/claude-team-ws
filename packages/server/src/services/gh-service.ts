import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export class GhService {
  constructor(private readonly cwd: string) {}

  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFile('gh', args, {
        cwd: this.cwd,
        timeout: 30_000,
      })
      return stdout.trim()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`GhService.exec failed for [gh ${args.join(' ')}]: ${message}`)
    }
  }

  private async execJson<T = unknown>(args: string[]): Promise<T> {
    const output = await this.exec([...args, '--json'])
    try {
      return JSON.parse(output) as T
    } catch {
      throw new Error(`GhService.execJson: invalid JSON from [gh ${args.join(' ')}]`)
    }
  }

  async getPr(prUrl: string): Promise<Record<string, unknown>> {
    const output = await this.exec([
      'pr', 'view', prUrl,
      '--json', 'number,title,state,headRefName,baseRefName,additions,deletions,files,reviews,comments',
    ])
    return JSON.parse(output)
  }

  async getPrDiff(prUrl: string): Promise<string> {
    return this.exec(['pr', 'diff', prUrl])
  }

  async mergePr(prUrl: string, strategy: 'squash' | 'merge' | 'rebase'): Promise<void> {
    const args = ['pr', 'merge', prUrl, `--${strategy}`, '--auto']
    await this.exec(args)
  }

  async addPrComment(prUrl: string, body: string): Promise<void> {
    await this.exec(['pr', 'comment', prUrl, '--body', body])
  }

  async addPrReviewComment(prUrl: string, file: string, line: number, body: string): Promise<void> {
    // gh doesn't directly support inline comments via CLI, use API
    await this.exec([
      'api', '-X', 'POST',
      `repos/{owner}/{repo}/pulls/{pull_number}/comments`,
      '-f', `body=${body}`,
      '-f', `path=${file}`,
      '-F', `line=${line}`,
    ])
  }
}
