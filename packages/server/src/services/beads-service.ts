import { execFile as execFileCb } from 'child_process'
import { promisify } from 'util'

const execFile = promisify(execFileCb)

export interface BeadIssue {
  id: string
  title: string
  status: string
  priority: number
  issue_type: string
  labels: string[]
  created_at: string
  updated_at: string
  created_by: string
  source_repo: string
  dependencies?: BeadDependency[]
  dependents?: BeadDependency[]
  comments?: BeadComment[]
}

export interface BeadDependency {
  id: string
  title: string
  status: string
  priority: number
  dependency_type: string
}

export interface BeadComment {
  id: number
  issue_id: string
  author: string
  text: string
  created_at: string
}

export class BeadsService {
  private readonly cwd: string

  constructor(projectRoot: string) {
    this.cwd = projectRoot
  }

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

  private async execJson<T>(args: string[]): Promise<T> {
    const output = await this.exec([...args, '--json'])
    try {
      return JSON.parse(output) as T
    } catch {
      throw new Error(`BeadsService.execJson: invalid JSON from [${args.join(' ')}]: ${output.slice(0, 200)}`)
    }
  }

  async list(options?: { status?: string; labels?: string[] }): Promise<BeadIssue[]> {
    const args = ['list']
    if (options?.status) args.push(`--status=${options.status}`)
    if (options?.labels?.length) {
      for (const label of options.labels) {
        args.push(`--label=${label}`)
      }
    }
    return this.execJson<BeadIssue[]>(args)
  }

  async show(beadId: string): Promise<BeadIssue> {
    const results = await this.execJson<BeadIssue[]>(['show', beadId])
    if (!results.length) {
      throw new Error(`BeadsService.show: bead ${beadId} not found`)
    }
    return results[0]
  }

  async ready(): Promise<BeadIssue[]> {
    return this.execJson<BeadIssue[]>(['ready'])
  }

  async create(options: {
    title: string
    type?: string
    priority?: number
    labels?: string[]
    description?: string
  }): Promise<string> {
    const args = ['create', `--title=${options.title}`]
    if (options.type) args.push(`-t`, options.type)
    if (options.priority !== undefined) args.push(`-p`, String(options.priority))
    if (options.labels?.length) {
      for (const label of options.labels) {
        args.push(`--label=${label}`)
      }
    }
    if (options.description) args.push(`--description=${options.description}`)

    const output = await this.exec(args)
    // br create outputs: "Created bd-xxx: Title"
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
    if (options.priority !== undefined) args.push(`-p`, String(options.priority))
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
