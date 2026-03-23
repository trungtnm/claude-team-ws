import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

class BvService {
  private readonly projectRoot: string

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot
  }

  async robotPlan(): Promise<any> {
    return this.exec(['--robot-plan'])
  }

  async robotTriage(): Promise<any> {
    return this.exec(['--robot-triage'])
  }

  async robotNext(): Promise<any> {
    return this.exec(['--robot-next'])
  }

  async robotInsights(): Promise<any> {
    return this.exec(['--robot-insights'])
  }

  async robotAlerts(): Promise<any> {
    return this.exec(['--robot-alerts'])
  }

  private async exec(args: string[]): Promise<any> {
    try {
      const { stdout } = await execFileAsync('bv', args, { cwd: this.projectRoot })
      return JSON.parse(stdout)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`BvService command failed [${args.join(' ')}]: ${message}`)
    }
  }
}

export default BvService
