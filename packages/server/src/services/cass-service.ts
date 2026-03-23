import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

class CassService {
  private readonly projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  async search(query: string): Promise<any> {
    return this.exec(['search', '--robot', query])
  }

  async index(): Promise<any> {
    return this.exec(['index'])
  }

  private async exec(args: string[]): Promise<any> {
    try {
      const { stdout } = await execFileAsync('cass', args, { cwd: this.projectRoot })
      return JSON.parse(stdout)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`CassService command failed [${args.join(' ')}]: ${message}`)
    }
  }
}

export default CassService
