import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export interface GraphNode {
  id: string
  title: string
  status: string
  priority: number
  type: string
  labels?: string[]
}

export interface GraphEdge {
  source: string
  target: string
  type: string
}

export interface GraphInsights {
  critical_path: string[]
  bottlenecks: Array<{ id: string; betweenness: number }>
  ready: string[]
}

export class BvService {
  private readonly cwd: string

  constructor(projectRoot: string) {
    this.cwd = projectRoot
  }

  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFile('bv', args, {
        cwd: this.cwd,
        timeout: 15000,
      })
      return stdout.trim()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`BvService.exec failed for [${args.join(' ')}]: ${message}`)
    }
  }

  private async execJson<T>(args: string[]): Promise<T> {
    const output = await this.exec(args)
    try {
      return JSON.parse(output) as T
    } catch {
      throw new Error(`BvService.execJson: invalid JSON from [${args.join(' ')}]: ${output.slice(0, 200)}`)
    }
  }

  async getGraph(format: 'json' | 'dot' | 'mermaid' = 'json'): Promise<unknown> {
    return this.execJson([`--robot-graph`, `--graph-format=${format}`])
  }

  async getTriage(): Promise<unknown> {
    return this.execJson(['--robot-triage'])
  }

  async getPlan(label?: string): Promise<unknown> {
    const args = ['--robot-plan']
    if (label) args.push(`--label`, label)
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
