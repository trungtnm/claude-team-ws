import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface ListOptions {
  status?: string
  sort?: string
}

interface CreateOptions {
  priority?: number
  type?: string
  labels?: string[]
  description?: string
}

interface UpdateOptions {
  status?: string
  priority?: number
  title?: string
  addLabel?: string
}

class BeadsService {
  private readonly projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  async list(options?: ListOptions): Promise<any> {
    const args = ['list', '--json']
    if (options?.status) {
      args.push('--status', options.status)
    }
    if (options?.sort) {
      args.push('--sort', options.sort)
    }
    return this.exec(args)
  }

  async show(beadId: string): Promise<any> {
    return this.exec(['show', beadId, '--json'])
  }

  async create(title: string, options: CreateOptions): Promise<any> {
    const args = ['create', '--actor', 'assistant', '--json', '--title', title]
    if (options.priority !== undefined) {
      args.push('--priority', String(options.priority))
    }
    if (options.type) {
      args.push('--type', options.type)
    }
    if (options.labels) {
      for (const label of options.labels) {
        args.push('--labels', label)
      }
    }
    if (options.description) {
      args.push('--description', options.description)
    }
    return this.exec(args)
  }

  async update(beadId: string, options: UpdateOptions): Promise<any> {
    const args = ['update', '--actor', 'assistant', beadId, '--json']
    if (options.status) {
      args.push('--status', options.status)
    }
    if (options.priority !== undefined) {
      args.push('--priority', String(options.priority))
    }
    if (options.title) {
      args.push('--title', options.title)
    }
    if (options.addLabel) {
      args.push('--add-label', options.addLabel)
    }
    return this.exec(args)
  }

  async close(beadId: string, reason: string): Promise<any> {
    return this.exec(['close', '--actor', 'assistant', beadId, '--json', '--reason', reason])
  }

  async ready(): Promise<any> {
    return this.exec(['ready', '--json'])
  }

  async blocked(): Promise<any> {
    return this.exec(['blocked', '--json'])
  }

  async syncFlush(): Promise<any> {
    return this.exec(['sync', '--flush-only'])
  }

  async syncImport(): Promise<any> {
    return this.exec(['sync', '--import-only'])
  }

  private async exec(args: string[]): Promise<any> {
    try {
      const { stdout } = await execFileAsync('br', args, { cwd: this.projectRoot })
      return JSON.parse(stdout)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`BeadsService command failed [${args.join(' ')}]: ${message}`)
    }
  }
}

export default BeadsService
