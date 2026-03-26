import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export class BvService {
  constructor(private readonly cwd: string) {}

  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFile('bv', args, {
        cwd: this.cwd,
        timeout: 15_000,
      })
      return stdout.trim()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`BvService.exec failed for [${args.join(' ')}]: ${message}`)
    }
  }

  private async execJson<T = unknown>(args: string[]): Promise<T> {
    const output = await this.exec(args)
    try {
      return JSON.parse(output) as T
    } catch {
      throw new Error(`BvService.execJson: invalid JSON from [${args.join(' ')}]: ${output.slice(0, 200)}`)
    }
  }

  async getGraph(format: string = 'json'): Promise<unknown> {
    return this.execJson(['--robot-graph', `--graph-format=${format}`])
  }

  async getTriage(): Promise<unknown> {
    return this.execJson(['--robot-triage'])
  }

  async getPlan(label?: string): Promise<unknown> {
    const args = ['--robot-plan']
    if (label) args.push('--label', label)
    return this.execJson(args)
  }

  async getInsights(): Promise<unknown> {
    return this.execJson(['--robot-insights'])
  }

  async getNext(): Promise<unknown> {
    return this.execJson(['--robot-next'])
  }

  async getAlerts(): Promise<unknown> {
    return this.execJson(['--robot-alerts'])
  }

  async getLabelHealth(): Promise<unknown> {
    return this.execJson(['--robot-label-health'])
  }
}
