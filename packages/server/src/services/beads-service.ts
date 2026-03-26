import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export class BeadsService {
  constructor(private readonly cwd: string) {}

  private async exec(args: string[]): Promise<string> {
    try {
      const { stdout } = await execFile('br', args, {
        cwd: this.cwd,
        env: { ...process.env, CI: '1' },
      })
      return stdout.trim()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(`BeadsService.exec failed for [${args.join(' ')}]: ${message}`)
    }
  }

  private async execJson<T = unknown>(args: string[]): Promise<T> {
    const output = await this.exec([...args, '--json'])
    try {
      return JSON.parse(output) as T
    } catch {
      throw new Error(`BeadsService.execJson: invalid JSON from [${args.join(' ')}]: ${output.slice(0, 200)}`)
    }
  }

  async list(options?: { status?: string; labels?: string[] }): Promise<unknown[]> {
    const args = ['list']
    if (options?.status) args.push(`--status=${options.status}`)
    if (options?.labels?.length) {
      for (const label of options.labels) {
        args.push(`--label=${label}`)
      }
    }
    return this.execJson(args)
  }

  async show(beadId: string): Promise<Record<string, unknown>> {
    const results = await this.execJson<Record<string, unknown>[]>(['show', beadId])
    if (!results.length) {
      throw new Error(`BeadsService.show: bead ${beadId} not found`)
    }
    return results[0]
  }

  async ready(): Promise<unknown[]> {
    return this.execJson(['ready'])
  }

  async create(options: {
    title: string
    type?: string
    priority?: number
    labels?: string[]
    description?: string
  }): Promise<string> {
    const args = ['create', `--title=${options.title}`]
    if (options.type) args.push('-t', options.type)
    if (options.priority !== undefined) args.push('-p', String(options.priority))
    if (options.labels?.length) {
      for (const label of options.labels) {
        args.push(`--label=${label}`)
      }
    }
    if (options.description) args.push(`--description=${options.description}`)

    const output = await this.exec(args)
    const match = output.match(/Created\s+(bd-\w+)/)
    if (!match) {
      throw new Error(`BeadsService.create: could not parse bead ID from output: ${output}`)
    }
    return match[1]
  }

  async update(beadId: string, options: {
    status?: string
    priority?: number
    title?: string
    labels?: string[]
  }): Promise<void> {
    const args = ['update', beadId]
    if (options.status) args.push(`--status=${options.status}`)
    if (options.priority !== undefined) args.push('-p', String(options.priority))
    if (options.title) args.push(`--title=${options.title}`)
    if (options.labels?.length) {
      for (const label of options.labels) {
        args.push(`--label=${label}`)
      }
    }
    await this.exec(args)
  }

  async close(beadId: string, reason?: string): Promise<void> {
    const args = ['close', beadId]
    if (reason) args.push(`--reason=${reason}`)
    await this.exec(args)
  }

  async addDependency(childId: string, parentId: string): Promise<void> {
    await this.exec(['dep', 'add', childId, parentId])
  }

  async removeDependency(childId: string, parentId: string): Promise<void> {
    await this.exec(['dep', 'remove', childId, parentId])
  }

  async addComment(beadId: string, text: string): Promise<void> {
    await this.exec(['comments', 'add', beadId, text])
  }

  async sync(): Promise<void> {
    await this.exec(['sync', '--flush-only'])
  }
}
